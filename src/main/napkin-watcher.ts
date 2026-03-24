import * as fs from 'fs';
import * as path from 'path';
import type { BrowserWindow } from 'electron';

export interface NapkinFileEntry {
  name: string;
  absPath: string;
  type: 'file';
}

export interface NapkinAgentEntry {
  name: string;
  absPath: string;
  type: 'agent';
  files: NapkinFileEntry[];
}

export interface NapkinDirEntry {
  name: string;
  absPath: string;
  type: 'dir';
  files: NapkinFileEntry[];
}

export interface NapkinSnapshot {
  slug: string;
  absPath: string;
  entries: (NapkinFileEntry | NapkinAgentEntry | NapkinDirEntry)[];
  napkinBullets: string[];
}

const DEBOUNCE_MS = 200;

let watcher: fs.FSWatcher | null = null;
let architectWatcher: fs.FSWatcher | null = null;
let parentWatcher: fs.FSWatcher | null = null;
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

let activeNepicDir: string | null = null;
let activeWindow: BrowserWindow | null = null;

/**
 * Read a single napkin directory and return a full filesystem snapshot.
 */
export async function readNapkinDir(napkinsDir: string, slug: string): Promise<NapkinSnapshot> {
  const dirPath = path.join(napkinsDir, slug);
  const snapshot: NapkinSnapshot = { slug, absPath: dirPath, entries: [], napkinBullets: [] };

  let dirEntries: fs.Dirent[];
  try {
    dirEntries = await fs.promises.readdir(dirPath, { withFileTypes: true });
  } catch {
    return snapshot;
  }

  for (const entry of dirEntries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isFile()) {
      snapshot.entries.push({ name: entry.name, absPath: entryPath, type: 'file' });
    } else if (entry.isDirectory()) {
      if (entry.name === 'agents') {
        // Promote agents/ children to top-level entries as type='agent'
        try {
          const agentDirs = await fs.promises.readdir(entryPath, { withFileTypes: true });
          for (const agentDir of agentDirs) {
            if (agentDir.isDirectory()) {
              const agentPath = path.join(entryPath, agentDir.name);
              const agentFiles: NapkinFileEntry[] = [];
              try {
                const files = await fs.promises.readdir(agentPath);
                for (const f of files) {
                  agentFiles.push({ name: f, absPath: path.join(agentPath, f), type: 'file' });
                }
              } catch {
                // unreadable agent dir — include with empty files
              }
              snapshot.entries.push({
                name: agentDir.name,
                absPath: agentPath,
                type: 'agent',
                files: agentFiles,
              });
            }
          }
        } catch {
          // no agents/ dir or unreadable — fine
        }
      } else {
        // Non-agent subdir → type='dir'
        const subFiles: NapkinFileEntry[] = [];
        try {
          const files = await fs.promises.readdir(entryPath);
          for (const f of files) {
            subFiles.push({ name: f, absPath: path.join(entryPath, f), type: 'file' });
          }
        } catch {
          // unreadable subdir — include with empty files
        }
        snapshot.entries.push({
          name: entry.name,
          absPath: entryPath,
          type: 'dir',
          files: subFiles,
        });
      }
    }
  }

  // Extract napkin bullets from .nap.md
  const napMdPath = path.join(dirPath, `${slug}.nap.md`);
  try {
    const content = await fs.promises.readFile(napMdPath, 'utf-8');
    const lines = content.split('\n');
    for (const line of lines) {
      // Top-level bullets only: lines starting with * (no leading whitespace)
      if (/^\*\s/.test(line)) {
        snapshot.napkinBullets.push(line.replace(/^\*\s*/, '').trim());
      }
    }
  } catch {
    // no .nap.md — fine
  }

  return snapshot;
}

/**
 * Full scan of 30-napkins/ — returns all napkin snapshots.
 */
async function fullScan(napkinsDir: string): Promise<NapkinSnapshot[]> {
  try {
    const entries = await fs.promises.readdir(napkinsDir, { withFileTypes: true });
    const napkins: NapkinSnapshot[] = [];
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

function sendUpdate(win: BrowserWindow, payload: NapkinSnapshot | NapkinSnapshot[]): void {
  if (!win.isDestroyed()) {
    win.webContents.send('napkin:update', payload);
  }
}

function sendArchitectUpdate(win: BrowserWindow, payload: NapkinSnapshot | NapkinSnapshot[]): void {
  if (!win.isDestroyed()) {
    win.webContents.send('architect:update', payload);
  }
}

function scheduleArchitectUpdate(architectsDir: string, slug: string, win: BrowserWindow): void {
  const key = `arch:${slug}`;
  const existing = debounceTimers.get(key);
  if (existing) clearTimeout(existing);

  debounceTimers.set(
    key,
    setTimeout(async () => {
      debounceTimers.delete(key);
      const data = await readNapkinDir(architectsDir, slug);
      sendArchitectUpdate(win, data);
    }, DEBOUNCE_MS),
  );
}

async function fullArchitectScan(architectsDir: string): Promise<NapkinSnapshot[]> {
  try {
    const entries = await fs.promises.readdir(architectsDir, { withFileTypes: true });
    const snapshots: NapkinSnapshot[] = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        snapshots.push(await readNapkinDir(architectsDir, entry.name));
      }
    }
    return snapshots;
  } catch {
    return [];
  }
}

function startWatchingArchitects(architectsDir: string, win: BrowserWindow): void {
  if (architectWatcher) {
    architectWatcher.close();
    architectWatcher = null;
  }

  try {
    architectWatcher = fs.watch(architectsDir, { recursive: true }, (_eventType, filename) => {
      if (!filename) return;
      const slug = slugFromWatchPath(filename);
      if (!slug) return;
      scheduleArchitectUpdate(architectsDir, slug, win);
    });

    architectWatcher.on('error', () => {
      if (architectWatcher) {
        architectWatcher.close();
        architectWatcher = null;
      }
    });
  } catch {
    // 20-architects/ may not exist yet
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
  const architectsDir = path.join(nepicDir, '20-architects');

  // Initial full scan — napkins + architects
  const napkins = await fullScan(napkinsDir);
  sendUpdate(win, napkins);

  const architects = await fullArchitectScan(architectsDir);
  if (architects.length > 0) {
    sendArchitectUpdate(win, architects);
  }

  // Start watching 30-napkins/ (may not exist yet)
  startWatchingNapkins(napkinsDir, win);

  // Start watching 20-architects/ (may not exist yet)
  startWatchingArchitects(architectsDir, win);

  // Watch the parent (nepicDir) for 30-napkins/ or 20-architects/ creation
  try {
    parentWatcher = fs.watch(nepicDir, (_eventType, filename) => {
      if (filename === '30-napkins' && !watcher) {
        setTimeout(async () => {
          startWatchingNapkins(napkinsDir, win);
          const data = await fullScan(napkinsDir);
          if (data.length > 0) {
            sendUpdate(win, data);
          }
        }, 100);
      }
      if (filename === '20-architects' && !architectWatcher) {
        setTimeout(async () => {
          startWatchingArchitects(architectsDir, win);
          const data = await fullArchitectScan(architectsDir);
          if (data.length > 0) {
            sendArchitectUpdate(win, data);
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
export async function getActiveNapkinData(): Promise<NapkinSnapshot[]> {
  if (!activeNepicDir) return [];
  const napkinsDir = path.join(activeNepicDir, '30-napkins');
  return fullScan(napkinsDir);
}

export async function getActiveArchitectData(): Promise<NapkinSnapshot[]> {
  if (!activeNepicDir) return [];
  const architectsDir = path.join(activeNepicDir, '20-architects');
  return fullArchitectScan(architectsDir);
}

/**
 * Stop the napkin watcher and clean up.
 */
export function stopNapkinWatcher(): void {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
  if (architectWatcher) {
    architectWatcher.close();
    architectWatcher = null;
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
