import * as fs from 'fs';
import * as path from 'path';
import type { BrowserWindow } from 'electron';

export interface AgentData {
  name: string;
  files: string[];
}

export interface NapkinData {
  slug: string;
  artifacts: string[];
  agents: AgentData[];
  napkinBullets: string[];
}

const KNOWN_ARTIFACTS = ['.nap.md', '.spec.md', '.test.md', '.journeys.md'];
const DEBOUNCE_MS = 200;

let watcher: fs.FSWatcher | null = null;
let parentWatcher: fs.FSWatcher | null = null;
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

let activeNepicDir: string | null = null;
let activeWindow: BrowserWindow | null = null;

/**
 * Read a single napkin directory and return its structured data.
 */
export async function readNapkinDir(napkinsDir: string, slug: string): Promise<NapkinData> {
  const dirPath = path.join(napkinsDir, slug);
  const data: NapkinData = { slug, artifacts: [], agents: [], napkinBullets: [] };

  // Read artifact files
  try {
    const entries = await fs.promises.readdir(dirPath);
    for (const entry of entries) {
      for (const ext of KNOWN_ARTIFACTS) {
        if (entry.endsWith(ext)) {
          data.artifacts.push(ext);
          break;
        }
      }
    }
  } catch {
    // dir doesn't exist or unreadable — return empty data
    return data;
  }

  // Read agents/ subdirectory and their files
  const agentsDir = path.join(dirPath, 'agents');
  try {
    const agentEntries = await fs.promises.readdir(agentsDir, { withFileTypes: true });
    for (const entry of agentEntries) {
      if (entry.isDirectory()) {
        const agentFiles: string[] = [];
        try {
          const files = await fs.promises.readdir(path.join(agentsDir, entry.name));
          for (const f of files) {
            agentFiles.push(f);
          }
        } catch {
          // unreadable agent dir — include with empty files
        }
        data.agents.push({ name: entry.name, files: agentFiles });
      }
    }
  } catch {
    // no agents/ dir — fine
  }

  // Read napkin bullets from .nap.md
  const napMdPath = path.join(dirPath, `${slug}.nap.md`);
  try {
    const content = await fs.promises.readFile(napMdPath, 'utf-8');
    const lines = content.split('\n');
    for (const line of lines) {
      // Top-level bullets only: lines starting with * (no leading whitespace)
      if (/^\*\s/.test(line)) {
        data.napkinBullets.push(line.replace(/^\*\s*/, '').trim());
      }
    }
  } catch {
    // no .nap.md — fine
  }

  return data;
}

/**
 * Full scan of 30-napkins/ — returns all napkin data.
 */
async function fullScan(napkinsDir: string): Promise<NapkinData[]> {
  try {
    const entries = await fs.promises.readdir(napkinsDir, { withFileTypes: true });
    const napkins: NapkinData[] = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        napkins.push(await readNapkinDir(napkinsDir, entry.name));
      }
    }
    return napkins;
  } catch {
    return [];
  }
}

/**
 * Extract the napkin slug from a fs.watch event filename.
 * The filename is relative to the watched dir (30-napkins/).
 * e.g. "0200-sqlite-setup/foo.md" → "0200-sqlite-setup"
 */
function slugFromWatchPath(filename: string): string | null {
  if (!filename) return null;
  const parts = filename.split(path.sep);
  return parts[0] || null;
}

function sendUpdate(win: BrowserWindow, payload: NapkinData | NapkinData[]): void {
  if (!win.isDestroyed()) {
    win.webContents.send('napkin:update', payload);
  }
}

function scheduleUpdate(napkinsDir: string, slug: string, win: BrowserWindow): void {
  const existing = debounceTimers.get(slug);
  if (existing) clearTimeout(existing);

  debounceTimers.set(
    slug,
    setTimeout(async () => {
      debounceTimers.delete(slug);
      const data = await readNapkinDir(napkinsDir, slug);
      sendUpdate(win, data);
    }, DEBOUNCE_MS),
  );
}

function startWatchingNapkins(napkinsDir: string, win: BrowserWindow): void {
  if (watcher) {
    watcher.close();
    watcher = null;
  }

  try {
    watcher = fs.watch(napkinsDir, { recursive: true }, (_eventType, filename) => {
      if (!filename) return;
      const slug = slugFromWatchPath(filename);
      if (!slug) return;
      scheduleUpdate(napkinsDir, slug, win);
    });

    watcher.on('error', () => {
      // Watcher errored — close it, will be re-established if parent watcher fires
      if (watcher) {
        watcher.close();
        watcher = null;
      }
    });
  } catch {
    // 30-napkins/ may not exist yet — parent watcher will handle
  }
}

/**
 * Start watching a nepic's 30-napkins/ directory.
 * Sends initial full scan, then incremental updates on changes.
 */
export async function startNapkinWatcher(
  nepicDir: string,
  win: BrowserWindow,
): Promise<void> {
  activeNepicDir = nepicDir;
  activeWindow = win;

  const napkinsDir = path.join(nepicDir, '30-napkins');

  // Initial full scan
  const napkins = await fullScan(napkinsDir);
  sendUpdate(win, napkins);

  // Start watching 30-napkins/ (may not exist yet)
  startWatchingNapkins(napkinsDir, win);

  // Watch the parent (nepicDir) for 30-napkins/ creation
  try {
    parentWatcher = fs.watch(nepicDir, (_eventType, filename) => {
      if (filename === '30-napkins' && !watcher) {
        // 30-napkins/ was just created — start watching it + full scan
        setTimeout(async () => {
          startWatchingNapkins(napkinsDir, win);
          const data = await fullScan(napkinsDir);
          if (data.length > 0) {
            sendUpdate(win, data);
          }
        }, 100);
      }
    });

    parentWatcher.on('error', () => {
      // parent dir watcher error — not critical
    });
  } catch {
    // nepicDir doesn't exist — nothing to watch
  }
}

/**
 * Return current napkin data for the active nepic (pull-based).
 * Used by the renderer to request initial data after its IPC listener is ready.
 */
export async function getActiveNapkinData(): Promise<NapkinData[]> {
  if (!activeNepicDir) return [];
  const napkinsDir = path.join(activeNepicDir, '30-napkins');
  return fullScan(napkinsDir);
}

/**
 * Stop the napkin watcher and clean up.
 */
export function stopNapkinWatcher(): void {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
  if (parentWatcher) {
    parentWatcher.close();
    parentWatcher = null;
  }
  for (const timer of debounceTimers.values()) {
    clearTimeout(timer);
  }
  debounceTimers.clear();
  activeNepicDir = null;
  activeWindow = null;
}
