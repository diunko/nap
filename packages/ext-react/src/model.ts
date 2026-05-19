/**
 * Model layer — sits between adapter events and the store.
 * Debounces rapid events and suppresses echo (own writes).
 * Same role as the app's model.ts but much simpler.
 */
import type { LightningFsAdapter, FsChangeEvent } from './fs-adapter';
import type { NavNode } from './nav-tree';
import { parseNavTree } from './nav-tree';
import type { DirEntry } from './nav-tree';
import { useNapStore } from './store';

const DEBOUNCE_MS = 200;

export interface ModelOptions {
  adapter: LightningFsAdapter;
  /** Root of the nepic directory in LFS (e.g., /home/user/repo/nepics/01-v1) */
  getNepicRoot: () => string | null;
}

export interface NapModel {
  /** Stop listening to adapter events. */
  destroy: () => void;
  /** Trigger a full nav refresh (e.g., after git clone). */
  refreshNav: () => Promise<void>;
  /** Reload the active file content (e.g., after external edit). */
  reloadActiveFile: () => Promise<void>;
  /** Set the echo suppression flag (set before auto-save, clear after). */
  suppressEcho: (suppress: boolean) => void;
  /** Notify that a git command completed — triggers full refresh. */
  onRepoChanged: () => void;
}

export function createModel(options: ModelOptions): NapModel {
  const { adapter, getNepicRoot } = options;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let echoSuppressed = false;

  // Subscribe to adapter change events
  const unsubAdapter = adapter.onChange((event: FsChangeEvent) => {
    handleChange(event);
  });

  function handleChange(event: FsChangeEvent): void {
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
        console.log(`[model] debounce → reloadFile ${event.path}`);
        reloadActiveFile();
      } else {
        console.log(`[model] debounce → refreshNav (path: ${event.path})`);
        refreshNav();
      }
    }, DEBOUNCE_MS);
  }

  async function refreshNav(): Promise<void> {
    const nepicRoot = getNepicRoot();
    if (!nepicRoot) {
      console.log(`[model] refreshNav skipped — no nepic root`);
      return;
    }

    console.log(`[model] repo-changed → refreshNav`);
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
      } catch {
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

    const sections = await parseNavTree(nepicRoot, readDir, readJson);
    useNapStore.getState().refreshNav(sections);
  }

  async function reloadActiveFile(): Promise<void> {
    const activeFilePath = useNapStore.getState().activeFilePath;
    if (!activeFilePath) return;
    // The ContentPane watches for this via a store subscription
    // We signal by bumping a version counter or dispatching a custom event
    console.log(`[model] reloadFile ${activeFilePath}`);
    // Dispatch event for ContentPane to pick up
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('nap-external-change', { detail: { path: activeFilePath } }));
    }
  }

  function onRepoChanged(): void {
    console.log(`[model] repo-changed`);
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      refreshNav();
    }, DEBOUNCE_MS);
  }

  return {
    destroy: () => {
      unsubAdapter();
      if (debounceTimer) clearTimeout(debounceTimer);
    },
    refreshNav,
    reloadActiveFile,
    suppressEcho: (suppress: boolean) => {
      echoSuppressed = suppress;
    },
    onRepoChanged,
  };
}
