import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';

// ── Injectable filesystem interface (v2: async + write + watch) ──

export interface FileSystem {
  readdir(dir: string): Promise<string[]>;
  readJSON(filePath: string): Promise<unknown | null>;
  readFile(filePath: string): Promise<string | null>;
  isDirectory(filePath: string): Promise<boolean>;
  writeJSON(filePath: string, data: unknown): Promise<void>;
  writeFile(filePath: string, content: string): Promise<void>;
  watch(dir: string, callback: (event: string, filename: string) => void): () => void;
}

// Backward compat alias
export type FileSystemReader = FileSystem;

// ── Production implementation — wraps real fs ──

export class NodeFileSystem implements FileSystem {
  async readdir(dir: string): Promise<string[]> {
    try {
      return await fsPromises.readdir(dir);
    } catch {
      return [];
    }
  }

  async readJSON(filePath: string): Promise<unknown | null> {
    try {
      const content = await fsPromises.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  async readFile(filePath: string): Promise<string | null> {
    try {
      return await fsPromises.readFile(filePath, 'utf-8');
    } catch {
      return null;
    }
  }

  async isDirectory(filePath: string): Promise<boolean> {
    try {
      const stat = await fsPromises.stat(filePath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  async writeJSON(filePath: string, data: unknown): Promise<void> {
    await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
    await fsPromises.writeFile(filePath, JSON.stringify(data, null, 2));
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
    await fsPromises.writeFile(filePath, content);
  }

  watch(dir: string, callback: (event: string, filename: string) => void): () => void {
    const watcher = fs.watch(dir, { recursive: true }, (event, filename) => {
      if (filename) callback(event, filename);
    });
    return () => watcher.close();
  }
}

// ── In-memory implementation for tests (v2: async + write + watch) ──

export class MemoryFileSystem implements FileSystem {
  private files: Record<string, object | string | null>;
  private watchers: Map<string, Set<(event: string, filename: string) => void>> = new Map();

  constructor(files: Record<string, object | string | null>) {
    this.files = { ...files };
  }

  async readdir(dir: string): Promise<string[]> {
    const normalized = dir.endsWith('/') ? dir : dir + '/';
    const entries = new Set<string>();

    for (const key of Object.keys(this.files)) {
      if (!key.startsWith(normalized)) continue;
      const rest = key.slice(normalized.length);
      const parts = rest.split('/');
      if (parts[0]) {
        entries.add(parts[0]);
      }
    }

    return Array.from(entries).sort();
  }

  async readJSON(filePath: string): Promise<unknown | null> {
    const value = this.files[filePath];
    return value !== undefined ? value : null;
  }

  async readFile(filePath: string): Promise<string | null> {
    const value = this.files[filePath];
    if (value === undefined || value === null) return null;
    if (typeof value === 'string') return value;
    return JSON.stringify(value);
  }

  async isDirectory(dirPath: string): Promise<boolean> {
    const normalized = dirPath.endsWith('/') ? dirPath : dirPath + '/';
    for (const key of Object.keys(this.files)) {
      if (key.startsWith(normalized)) return true;
    }
    if (this.files[dirPath] !== undefined && this.files[dirPath] === null) {
      return true;
    }
    return false;
  }

  async writeJSON(filePath: string, data: unknown): Promise<void> {
    this.files[filePath] = data as object;
    this._triggerWatch(filePath);
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    this.files[filePath] = content;
    this._triggerWatch(filePath);
  }

  watch(dir: string, callback: (event: string, filename: string) => void): () => void {
    if (!this.watchers.has(dir)) {
      this.watchers.set(dir, new Set());
    }
    this.watchers.get(dir)!.add(callback);
    return () => {
      const set = this.watchers.get(dir);
      if (set) {
        set.delete(callback);
        if (set.size === 0) this.watchers.delete(dir);
      }
    };
  }

  /** Manually trigger watch callbacks (for external-change tests) */
  simulateChange(filePath: string): void {
    this._triggerWatch(filePath);
  }

  /** Update a file WITHOUT triggering watch (set up state before simulateChange) */
  updateFile(filePath: string, data: object | string): void {
    this.files[filePath] = data;
  }

  /** Add a new file WITHOUT triggering watch */
  addFile(filePath: string, data: object | string): void {
    this.files[filePath] = data;
  }

  private _triggerWatch(filePath: string): void {
    for (const [dir, callbacks] of this.watchers) {
      const normalized = dir.endsWith('/') ? dir : dir + '/';
      if (filePath.startsWith(normalized) || filePath === dir) {
        const relative = filePath.startsWith(normalized)
          ? filePath.slice(normalized.length)
          : filePath;
        for (const cb of callbacks) {
          cb('change', relative);
        }
      }
    }
  }
}
