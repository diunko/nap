/**
 * Model layer — owns the data pipeline between filesystem and store.
 *
 * Responsibilities:
 * - Subscribe to adapter change events → debounce → refresh nav or reload file
 * - Handle git command completion → scan for nepic root → refresh nav
 * - Echo suppression for auto-save writes
 * - Reload active file on external changes
 *
 * Components call model methods. Model calls store actions. One direction.
 */
import type { LightningFsAdapter, FsChangeEvent } from './fs-adapter';
import { parseNavTree } from './nav-tree';
import type { DirEntry } from './nav-tree';
import { useNapStore } from './store';

const DEBOUNCE_MS = 200;

export interface ModelOptions {
  adapter: LightningFsAdapter;
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
}

export function createModel(options: ModelOptions): NapModel {
  const { adapter } = options;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let echoSuppressed = false;
  let nepicRoot: string | null = null;

  console.log('[model] created');

  // Subscribe to adapter change events
  const unsubAdapter = adapter.onChange((event: FsChangeEvent) => {
    handleAdapterChange(event);
  });

  function handleAdapterChange(event: FsChangeEvent): void {
    if (echoSuppressed) {
      console.log(`[adapter] emit ${event.type} (SUPPRESSED — own write)`);
      return;
    }

    // Debounce: batch rapid writes
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      const activeFilePath = useNapStore.getState().activeFilePath;
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

    const isGitCommand = trimmed.startsWith('git clone') ||
      trimmed.startsWith('git pull') ||
      trimmed.startsWith('git checkout') ||
      trimmed.startsWith('git fetch');

    if (!isGitCommand) return;

    console.log('[model] git command detected → scanning for nepic root');
    findNepicRoot(adapter).then((root) => {
      if (root) {
        console.log(`[model] found nepic root: ${root}`);
        nepicRoot = root;
        console.log(`[model] repo-changed → refreshNav`);
        refreshNavFromRoot(root);
      } else {
        console.log(`[model] nepic root not found after command`);
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
    useNapStore.getState().refreshNav(sections);
  }

  // ── File reload ──

  async function reloadActiveFile(): Promise<void> {
    const activeFilePath = useNapStore.getState().activeFilePath;
    if (!activeFilePath) return;
    console.log(`[model] reloadFile ${activeFilePath}`);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('nap-external-change', { detail: { path: activeFilePath } }));
    }
  }

  return {
    destroy: () => {
      console.log('[model] destroy');
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

        // Check for nepics/ at root (this is a .nap repo cloned directly)
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

        // Check for .nap/nepics/ (code repo with .nap subdir)
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
