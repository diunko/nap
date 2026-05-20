/**
 * Model layer — owns the data pipeline between filesystem and store,
 * AND the workflow orchestration (auto-clone, diff ranges, fetch latest).
 *
 * Responsibilities:
 * - Subscribe to adapter change events → debounce → refresh nav or reload file
 * - Handle git command completion → scan for nepic root → refresh nav
 * - Echo suppression for auto-save writes
 * - Reload active file on external changes
 * - Auto-clone on empty LFS when shell is available (config always present)
 * - Fetch PR diff ranges from GitHub API
 * - Fetch latest (git fetch + checkout)
 * - Refresh PR (re-read tab URL, update config, re-fetch diff ranges)
 *
 * Components call model methods. Model calls store actions. One direction.
 */
import type { LightningFsAdapter, FsChangeEvent } from './fs-adapter';
import { parseNavTree } from './nav-tree';
import type { DirEntry } from './nav-tree';
import type { NapStoreApi } from './store';
import { fetchPrDiffRanges } from './pr-diff';
import type { NapConfig } from './url-config';
import { resolveBootState } from './boot-gate';

const DEBOUNCE_MS = 200;

export interface ModelOptions {
  adapter: LightningFsAdapter;
  store: NapStoreApi;
  config: NapConfig;
}

export interface NapModel {
  destroy: () => void;
  refreshNav: () => Promise<void>;
  reloadActiveFile: () => Promise<void>;
  suppressEcho: (suppress: boolean) => void;
  /** Called by terminal when a command completes. Model decides what to do. */
  onCommandComplete: (command: string) => void;
  /** Get the discovered nepic root (null if not found yet). */
  getNepicRoot: () => string | null;
  /** Bootstrap filesystem + scan for existing repos. Call once after creation. */
  init: () => Promise<void>;
  /** Scan for existing repos in LFS (callable independently). */
  scanExistingRepos: () => Promise<void>;

  // ── Workflow orchestration ──

  /** Register the shell command executor. Called by TerminalPane when shell is ready. Pass null on cleanup. */
  registerShell: (exec: ((cmd: string) => Promise<void>) | null) => void;
  /** Execute git fetch + checkout to update the repo. */
  fetchLatest: () => void;
  /** Re-read tab URL, update config + store, invalidate + re-fetch diff ranges. No remount. */
  refreshPr: () => void;
  /** Get the provider key from the current config. */
  getProvider: () => string;
}

export function createModel(options: ModelOptions): NapModel {
  const { adapter, store } = options;

  // ── Existing state ──
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let echoSuppressed = false;
  let nepicRoot: string | null = null;

  // ── Orchestration state ──
  let shellExec: ((cmd: string) => Promise<void>) | null = null;
  let config: NapConfig = options.config;
  let cloneTriggered = false;
  let pendingNapkinFocus: string | null = null;
  let diffFetchInFlight = false;
  let destroyed = false;
  let initComplete = false;

  // Apply config to store immediately at construction
  applyConfigToStore(config);

  console.log('[model] created with config');

  // Subscribe to adapter change events
  const unsubAdapter = adapter.onChange((event: FsChangeEvent) => {
    handleAdapterChange(event);
  });

  function handleAdapterChange(event: FsChangeEvent): void {
    if (echoSuppressed) {
      console.log(`[adapter] emit ${event.type} (SUPPRESSED — own write)`);
      return;
    }

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      const activeFilePath = store.getState().activeFilePath;
      if (activeFilePath && event.path === activeFilePath) {
        console.log(`[model] debounce 200ms → reloadFile`);
        reloadActiveFile();
      } else {
        console.log(`[model] debounce → refreshNav (path: ${event.path})`);
        refreshNav();
      }
    }, DEBOUNCE_MS);
  }

  // ── Command completion handler ──

  function onCommandComplete(command: string): void {
    const trimmed = command.trim().split('\n')[0];
    console.log(`[terminal] commandComplete ${trimmed}`);

    // Use regex to detect git commands even inside compound expressions (cd X && git fetch)
    const isClone = /\bgit clone\b/.test(trimmed);
    const isFetch = /\bgit fetch\b/.test(trimmed);
    const isGitCommand = isClone || isFetch ||
      /\bgit (pull|checkout)\b/.test(trimmed);

    if (!isGitCommand) return;

    console.log('[model] git command detected → scanning for nepic root');
    findNepicRoot(adapter).then(async (root) => {
      if (destroyed) return;

      if (root) {
        console.log(`[model] found nepic root: ${root}`);
        nepicRoot = root;
        console.log(`[model] repo-changed → refreshNav`);
        await refreshNavFromRoot(root);

        // Post-clone: update status and focus napkin
        if (isClone && cloneTriggered) {
          store.getState().setCloningStatus('done');
          if (pendingNapkinFocus) {
            console.log(`[model] post-clone → expandCard ${pendingNapkinFocus}`);
            store.getState().expandCard(pendingNapkinFocus);
            pendingNapkinFocus = null;
          }
        }
      } else {
        console.log(`[model] nepic root not found after command`);
      }

      // After fetch: invalidate diff ranges and re-fetch
      if (isFetch && store.getState().prNum > 0) {
        store.getState().setPrDiffRanges(null);
        checkDiffRanges();
      }
    });
  }

  // ── Nav refresh ──

  async function refreshNav(): Promise<void> {
    if (!nepicRoot) {
      console.log(`[model] refreshNav skipped — no nepic root`);
      return;
    }
    await refreshNavFromRoot(nepicRoot);
  }

  async function refreshNavFromRoot(root: string): Promise<void> {
    console.log(`[model] refreshNav from ${root}`);
    const readDir = async (path: string): Promise<DirEntry[]> => {
      try {
        const entries = await adapter.readdir(path);
        const result: DirEntry[] = [];
        for (const name of entries) {
          try {
            const stat = await adapter.stat(`${path}/${name}`);
            result.push({ name, isDirectory: stat.isDirectory });
          } catch {
            result.push({ name, isDirectory: false });
          }
        }
        return result;
      } catch (e) {
        console.log(`[model] readDir failed for ${path}:`, e);
        return [];
      }
    };

    const readJson = async (path: string): Promise<Record<string, unknown> | undefined> => {
      try {
        const content = await adapter.readFile(path);
        return JSON.parse(content);
      } catch {
        return undefined;
      }
    };

    const sections = await parseNavTree(root, readDir, readJson);
    console.log(`[model] parseNavTree returned ${sections.length} sections`);
    store.getState().refreshNav(sections);
  }

  // ── File reload ──

  async function reloadActiveFile(): Promise<void> {
    const activeFilePath = store.getState().activeFilePath;
    if (!activeFilePath) return;
    console.log(`[model] reloadFile ${activeFilePath}`);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('nap-external-change', { detail: { path: activeFilePath } }));
    }
  }

  async function scanExistingRepos(): Promise<void> {
    console.log('[model] scanning for existing repos on startup');
    const root = await findNepicRoot(adapter);
    if (root) {
      console.log(`[model] startup scan found nepic root: ${root}`);
      nepicRoot = root;
      await refreshNavFromRoot(root);
    } else {
      console.log('[model] startup scan: no existing repos found');
    }
  }

  async function init(): Promise<void> {
    try { await adapter.mkdir('/home', { recursive: true }); } catch { /* exists */ }
    try { await adapter.mkdir('/home/user', { recursive: true }); } catch { /* exists */ }
    console.log('[model] ensured /home/user exists');
    await scanExistingRepos();
    initComplete = true;
    checkAutoClone();

    // Wait for Zustand persist hydration before checking diff ranges.
    // On return visit, hydration restores cached prDiffRanges → avoids redundant fetch.
    const persist = (store as any).persist;
    if (persist?.hasHydrated?.()) {
      checkDiffRanges();
    } else if (persist?.onFinishHydration) {
      persist.onFinishHydration(() => {
        if (!destroyed) checkDiffRanges();
      });
    } else {
      // Non-persisted store (vitest) — check immediately
      checkDiffRanges();
    }
  }

  // ── Workflow orchestration ──

  function registerShell(exec: ((cmd: string) => Promise<void>) | null): void {
    shellExec = exec;
    if (exec) {
      console.log('[model] shell registered');
      checkAutoClone();
    } else {
      console.log('[model] shell unregistered');
    }
  }

  /** Apply config to store state + set up napkin focus. Internal helper. */
  function applyConfigToStore(cfg: NapConfig): void {
    console.log(`[model] applyConfig: clone=${cfg.cloneUrl} napkin=${cfg.napkinFocus} pr=${cfg.prNum}`);

    const s = store.getState();
    s.setMainRepo({ owner: cfg.mainOwner, repo: cfg.mainRepo, branch: cfg.mainBranch });
    s.setPrNum(cfg.prNum);

    if (cfg.napkinFocus) {
      // Return visit: nav already populated → focus immediately
      if (s.navSections.length > 0) {
        console.log(`[model] return visit → expandCard ${cfg.napkinFocus}`);
        s.expandCard(cfg.napkinFocus);
      } else {
        // First visit: defer focus until after clone + nav populate
        pendingNapkinFocus = cfg.napkinFocus;
      }
    }
  }

  /**
   * Auto-clone check. Called from two places (config always present):
   * - registerShell() — shell just became available
   * - init() after scanExistingRepos() — scan finished
   *
   * Whichever fires last completes the preconditions and triggers the clone.
   * The cloneTriggered boolean prevents double-fire.
   */
  function checkAutoClone(): void {
    if (destroyed) return;
    if (!initComplete) return;  // wait for init to create dirs + scan
    if (!shellExec) return;     // shell not ready yet
    if (cloneTriggered) return; // already started
    if (nepicRoot) return;      // repos already exist (from scan)

    // Also check store — on return visit, navSections may be populated from hydration
    if (store.getState().navSections.length > 0) return;

    cloneTriggered = true;
    store.getState().setCloningStatus('cloning');
    console.log(`[auto-clone] starting: git clone ${config.cloneUrl}`);
    shellExec(`git clone ${config.cloneUrl}\r`);
  }

  function checkDiffRanges(): void {
    if (destroyed) return;
    if (diffFetchInFlight) return;

    const s = store.getState();
    if (s.prNum <= 0) return;
    if (!s.mainRepoConfig) return;
    if (s.prDiffRanges !== null) return; // already cached

    diffFetchInFlight = true;
    const { owner, repo } = s.mainRepoConfig;
    console.log(`[model] fetching PR diff ranges for ${owner}/${repo}#${s.prNum}`);
    fetchPrDiffRanges(owner, repo, s.prNum, s.githubToken || undefined).then((ranges) => {
      diffFetchInFlight = false;
      if (destroyed) return;
      if (ranges) {
        store.getState().setPrDiffRanges(ranges);
      }
    }).catch(() => {
      diffFetchInFlight = false;
    });
  }

  function fetchLatest(): void {
    if (!shellExec) {
      console.log('[fetch-latest] no shell — cannot execute');
      return;
    }
    const branch = config.napBranch || 'main';
    const repoName = config.cloneUrl?.split('/').pop()?.replace(/\.git$/, '') || '';
    if (!repoName) {
      console.log('[fetch-latest] cannot determine repo name from config');
      return;
    }
    const repoDir = `/home/user/${repoName}`;
    console.log(`[fetch-latest] starting in ${repoDir}: git fetch origin && git checkout origin/${branch}`);
    shellExec(`cd ${repoDir} && git fetch origin && git checkout origin/${branch}\r`);
  }

  /**
   * Refresh PR: re-read tab URL, update config + store, invalidate + re-fetch diff ranges.
   * Does NOT remount, switch session, or touch .nap filesystem.
   */
  function refreshPr(): void {
    if (typeof chrome === 'undefined' || !chrome.tabs?.query) {
      console.log('[refresh-pr] no chrome.tabs API');
      return;
    }

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (destroyed) return;
      const url = tabs[0]?.url;
      if (!url) {
        console.log('[refresh-pr] no tab URL');
        return;
      }

      const boot = resolveBootState(url);
      if (boot.state !== 'session') {
        console.log('[refresh-pr] tab URL no longer has nap hash — keeping current config');
        return;
      }

      // Update config in-place
      config = boot.config;
      const s = store.getState();
      s.setMainRepo({ owner: boot.config.mainOwner, repo: boot.config.mainRepo, branch: boot.config.mainBranch });
      s.setPrNum(boot.config.prNum);

      // Invalidate diff ranges and re-fetch
      s.setPrDiffRanges(null);
      diffFetchInFlight = false; // allow re-fetch
      checkDiffRanges();

      console.log(`[refresh-pr] updated config: pr=${boot.config.prNum}`);
    });
  }

  return {
    destroy: () => {
      console.log('[model] destroy');
      destroyed = true;
      shellExec = null;
      unsubAdapter();
      if (debounceTimer) clearTimeout(debounceTimer);
    },
    refreshNav,
    reloadActiveFile,
    suppressEcho: (suppress: boolean) => {
      echoSuppressed = suppress;
    },
    onCommandComplete,
    getNepicRoot: () => nepicRoot,
    init,
    scanExistingRepos,
    registerShell,
    fetchLatest,
    refreshPr,
    getProvider: () => config.provider,
  };
}

// ── Nepic root scanner ──

async function findNepicRoot(adapter: LightningFsAdapter): Promise<string | null> {
  console.log(`[model] findNepicRoot: scanning /home/user/`);
  try {
    const homeEntries = await adapter.readdir('/home/user');
    console.log(`[model] findNepicRoot: /home/user/ contains: [${homeEntries.join(', ')}]`);
    for (const dir of homeEntries) {
      try {
        const stat = await adapter.stat(`/home/user/${dir}`);
        if (!stat.isDirectory) continue;

        const napExists = await adapter.exists(`/home/user/${dir}/nepics`);
        console.log(`[model] findNepicRoot: /home/user/${dir}/nepics exists=${napExists}`);
        if (napExists) {
          const nepicDirs = await adapter.readdir(`/home/user/${dir}/nepics`);
          console.log(`[model] findNepicRoot: nepics/ contains: [${nepicDirs.join(', ')}]`);
          for (const nepic of nepicDirs) {
            const nStat = await adapter.stat(`/home/user/${dir}/nepics/${nepic}`);
            if (nStat.isDirectory) {
              const result = `/home/user/${dir}/nepics/${nepic}`;
              console.log(`[model] findNepicRoot: found ${result}`);
              return result;
            }
          }
        }

        const dotNapExists = await adapter.exists(`/home/user/${dir}/.nap/nepics`);
        if (dotNapExists) {
          const nepicDirs = await adapter.readdir(`/home/user/${dir}/.nap/nepics`);
          for (const nepic of nepicDirs) {
            const nStat = await adapter.stat(`/home/user/${dir}/.nap/nepics/${nepic}`);
            if (nStat.isDirectory) {
              const result = `/home/user/${dir}/.nap/nepics/${nepic}`;
              console.log(`[model] findNepicRoot: found ${result}`);
              return result;
            }
          }
        }
      } catch (e) {
        console.log(`[model] findNepicRoot: error scanning /home/user/${dir}:`, e);
        continue;
      }
    }
  } catch (e) {
    console.log(`[model] findNepicRoot: error reading /home/user:`, e);
  }
  console.log(`[model] findNepicRoot: not found`);
  return null;
}
