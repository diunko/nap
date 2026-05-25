/**
 * Model layer — owns the data pipeline between filesystem and store.
 *
 * Responsibilities:
 * - Subscribe to adapter change events → debounce → refresh nav or reload file
 * - Handle git command completion → scan for nepic root → refresh nav
 * - Echo suppression for auto-save writes
 * - Reload active file on external changes
 * - Fetch latest (git fetch + checkout)
 * - Refresh PR (re-read tab URL, update config, re-fetch diff ranges)
 *
 * Clone orchestration moved to pipeline.ts / pipeline-steps.ts.
 * Components call model methods. Model calls store actions. One direction.
 */
import type { LightningFsAdapter, FsChangeEvent } from './fs-adapter';
import { parseNavTree } from './nav-tree';
import type { DirEntry } from './nav-tree';
import type { NapStoreApi } from './store';
import { fetchPrDiffRanges, fetchPrHeadBranch } from './pr-diff';
import type { NapConfig } from './url-config';
import { resolveBootState } from './boot-gate';
import { globalTokens } from './chrome-storage';

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
  /** Set the nepic root and refresh navigation. Called by pipeline after scan. */
  setNepicRoot: (root: string) => Promise<void>;
  /** Bootstrap filesystem + scan for existing repos. */
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
  let diffFetchInFlight = false;
  let destroyed = false;

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
    findNepicRoot(adapter, config.nepicSlug).then(async (root) => {
      if (destroyed) return;

      if (root) {
        console.log(`[model] found nepic root: ${root}`);
        nepicRoot = root;
        console.log(`[model] repo-changed → refreshNav`);
        await refreshNavFromRoot(root);
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
    const root = await findNepicRoot(adapter, config.nepicSlug);
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
  }

  /** Set the nepic root and refresh navigation. Called by pipeline after scan. */
  async function setNepicRoot(root: string): Promise<void> {
    nepicRoot = root;
    console.log(`[model] setNepicRoot: ${root}`);
    await refreshNavFromRoot(root);
  }

  // ── Workflow orchestration ──

  function registerShell(exec: ((cmd: string) => Promise<void>) | null): void {
    shellExec = exec;
    console.log(exec ? '[model] shell registered' : '[model] shell unregistered');
  }

  /** Apply config to store state. Internal helper. */
  function applyConfigToStore(cfg: NapConfig): void {
    console.log(`[model] applyConfig: clone=${cfg.cloneUrl} pr=${cfg.prNum}`);
    const s = store.getState();
    s.setMainRepo({ owner: cfg.mainOwner, repo: cfg.mainRepo, branch: cfg.mainBranch });
    s.setPrNum(cfg.prNum);
  }

  function checkDiffRanges(): void {
    if (destroyed) return;
    if (diffFetchInFlight) return;

    const s = store.getState();
    if (s.prNum <= 0) return;
    if (!s.mainRepoConfig) return;
    if (s.prDiffRanges !== null) return; // already cached (return visit — branch also cached in mainRepoConfig)

    diffFetchInFlight = true;
    const { owner, repo } = s.mainRepoConfig;
    const prNum = s.prNum;
    const pat = globalTokens.githubToken || undefined;

    console.log(`[model] fetching PR data for ${owner}/${repo}#${prNum}`);

    // Fetch head branch and diff ranges in parallel
    Promise.all([
      fetchPrHeadBranch(owner, repo, prNum, pat),
      fetchPrDiffRanges(owner, repo, prNum, pat),
    ]).then(([headBranch, ranges]) => {
      diffFetchInFlight = false;
      if (destroyed) return;

      // Update head branch if available
      if (headBranch) {
        const current = store.getState().mainRepoConfig;
        if (current && current.branch !== headBranch) {
          console.log(`[model] updating mainBranch: ${current.branch} → ${headBranch}`);
          store.getState().setMainRepo({ ...current, branch: headBranch });
        }
      }

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
    setNepicRoot,
    init,
    scanExistingRepos,
    registerShell,
    fetchLatest,
    refreshPr,
    getProvider: () => config.provider,
  };
}

// ── Nepic root scanner ──

export async function findNepicRoot(adapter: LightningFsAdapter, nepicHint?: string | null): Promise<string | null> {
  console.log(`[model] findNepicRoot: scanning /home/user/ (hint=${nepicHint ?? 'none'})`);
  try {
    const homeEntries = await adapter.readdir('/home/user');
    console.log(`[model] findNepicRoot: /home/user/ contains: [${homeEntries.join(', ')}]`);
    for (const dir of homeEntries) {
      if (dir.startsWith('.')) continue; // Skip staging dirs (.tmp-*) and other dotfiles
      try {
        const stat = await adapter.stat(`/home/user/${dir}`);
        if (!stat.isDirectory) continue;

        const result = await findNepicInRepo(`/home/user/${dir}`, 'nepics', adapter, nepicHint)
          ?? await findNepicInRepo(`/home/user/${dir}`, '.nap/nepics', adapter, nepicHint);
        if (result) return result;
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

/** Scan a nepics/ directory for nepic subdirs. If nepicHint is given, prefer that one. */
async function findNepicInRepo(
  repoDir: string,
  nepicsRel: string,
  adapter: LightningFsAdapter,
  nepicHint?: string | null,
): Promise<string | null> {
  const nepicsPath = `${repoDir}/${nepicsRel}`;
  const exists = await adapter.exists(nepicsPath);
  if (!exists) return null;

  const nepicDirs = await adapter.readdir(nepicsPath);
  console.log(`[model] findNepicRoot: ${nepicsPath}/ contains: [${nepicDirs.join(', ')}]`);

  // If hint matches a directory, use it directly
  if (nepicHint && nepicDirs.includes(nepicHint)) {
    const hintPath = `${nepicsPath}/${nepicHint}`;
    const hStat = await adapter.stat(hintPath);
    if (hStat.isDirectory) {
      console.log(`[model] findNepicRoot: matched hint → ${hintPath}`);
      return hintPath;
    }
  }

  // Fallback: first directory
  for (const nepic of nepicDirs) {
    const nStat = await adapter.stat(`${nepicsPath}/${nepic}`);
    if (nStat.isDirectory) {
      const result = `${nepicsPath}/${nepic}`;
      console.log(`[model] findNepicRoot: found ${result}`);
      return result;
    }
  }
  return null;
}
