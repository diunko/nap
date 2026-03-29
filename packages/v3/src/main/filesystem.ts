import * as fs from 'fs';
import * as path from 'path';

// ── Injectable filesystem interface ──

export interface FileSystemReader {
  readdir(dir: string): string[];
  readJSON(filePath: string): unknown | null;
  isDirectory(filePath: string): boolean;
}

// ── Production implementation — wraps real fs ──

export class NodeFileSystem implements FileSystemReader {
  readdir(dir: string): string[] {
    try {
      return fs.readdirSync(dir);
    } catch {
      return [];
    }
  }

  readJSON(filePath: string): unknown | null {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  isDirectory(filePath: string): boolean {
    try {
      return fs.statSync(filePath).isDirectory();
    } catch {
      return false;
    }
  }
}

// ── In-memory implementation for tests ──

export class MemoryFileSystem implements FileSystemReader {
  private files: Record<string, object | null>;

  constructor(files: Record<string, object | null>) {
    this.files = files;
  }

  readdir(dir: string): string[] {
    const normalized = dir.endsWith('/') ? dir : dir + '/';
    const entries = new Set<string>();

    for (const key of Object.keys(this.files)) {
      if (!key.startsWith(normalized)) continue;
      const rest = key.slice(normalized.length);
      const firstSegment = rest.split('/')[0];
      if (firstSegment) {
        entries.add(firstSegment);
      }
    }

    // Also check for directory-only entries (paths that are prefixes of other paths)
    for (const key of Object.keys(this.files)) {
      // Check if any key looks like it's inside a subdir of `dir`
      if (!key.startsWith(normalized)) continue;
      const rest = key.slice(normalized.length);
      const parts = rest.split('/');
      if (parts.length > 1 && parts[0]) {
        entries.add(parts[0]);
      }
    }

    return Array.from(entries).sort();
  }

  readJSON(filePath: string): unknown | null {
    const value = this.files[filePath];
    return value !== undefined ? value : null;
  }

  isDirectory(dirPath: string): boolean {
    const normalized = dirPath.endsWith('/') ? dirPath : dirPath + '/';
    // A path is a directory if any key starts with it
    for (const key of Object.keys(this.files)) {
      if (key.startsWith(normalized)) return true;
    }
    // Also check exact match for directory markers (keys ending with /)
    if (this.files[dirPath] !== undefined && this.files[dirPath] === null) {
      // null value = directory marker
      return true;
    }
    return false;
  }
}
