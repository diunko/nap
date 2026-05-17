/**
 * LightningFS -> IFileSystem adapter.
 * Copied from bash-poc/src/fs-adapter.ts — identical logic.
 */
import type LightningFS from '@isomorphic-git/lightning-fs';
import type { IFileSystem, FsStat, MkdirOptions, RmOptions, CpOptions, BufferEncoding, FileContent } from 'just-bash';

type LFS = InstanceType<typeof LightningFS>;

function normalizePath(p: string): string {
  const parts = p.split('/');
  const out: string[] = [];
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') { out.pop(); continue; }
    out.push(part);
  }
  return '/' + out.join('/');
}

function resolvePath(base: string, rel: string): string {
  if (rel.startsWith('/')) return normalizePath(rel);
  return normalizePath(base + '/' + rel);
}

function toFsStat(s: { isFile(): boolean; isDirectory(): boolean; isSymbolicLink(): boolean; mode: number; size: number; mtimeMs: number }): FsStat {
  return {
    isFile: s.isFile(),
    isDirectory: s.isDirectory(),
    isSymbolicLink: s.isSymbolicLink(),
    mode: typeof s.mode === 'number' ? s.mode : 0o777,
    size: s.size,
    mtime: new Date(s.mtimeMs),
  };
}

export class LightningFsAdapter implements IFileSystem {
  private lfs: LFS;
  private paths: string[] = [];

  constructor(lfs: LFS) {
    this.lfs = lfs;
  }

  async readFile(path: string, options?: { encoding?: BufferEncoding | null } | BufferEncoding): Promise<string> {
    const encoding = typeof options === 'string' ? options : options?.encoding ?? 'utf8';
    return this.lfs.promises.readFile(path, { encoding: encoding as 'utf8' }) as Promise<string>;
  }

  async readFileBuffer(path: string): Promise<Uint8Array> {
    return this.lfs.promises.readFile(path) as Promise<Uint8Array>;
  }

  async writeFile(path: string, content: FileContent, _options?: { encoding?: BufferEncoding } | BufferEncoding): Promise<void> {
    await this.lfs.promises.writeFile(path, content as string | Uint8Array);
    this.trackPath(path);
  }

  async appendFile(path: string, content: FileContent, _options?: { encoding?: BufferEncoding } | BufferEncoding): Promise<void> {
    let existing: string;
    try {
      existing = await this.lfs.promises.readFile(path, 'utf8') as string;
    } catch {
      existing = '';
    }
    const appended = typeof content === 'string' ? existing + content : new Uint8Array([...new TextEncoder().encode(existing), ...content]);
    await this.lfs.promises.writeFile(path, appended as string | Uint8Array);
    this.trackPath(path);
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.lfs.promises.stat(path);
      return true;
    } catch {
      return false;
    }
  }

  async stat(path: string): Promise<FsStat> {
    const s = await this.lfs.promises.stat(path);
    return toFsStat(s as any);
  }

  async lstat(path: string): Promise<FsStat> {
    const s = await this.lfs.promises.lstat(path);
    return toFsStat(s as any);
  }

  async mkdir(path: string, options?: MkdirOptions): Promise<void> {
    if (options?.recursive) {
      const parts = normalizePath(path).split('/').filter(Boolean);
      let current = '';
      for (const part of parts) {
        current += '/' + part;
        try {
          await this.lfs.promises.mkdir(current);
        } catch (e: any) {
          if (e?.code !== 'EEXIST') throw e;
        }
      }
    } else {
      await this.lfs.promises.mkdir(path);
    }
    this.trackPath(path);
  }

  async readdir(path: string): Promise<string[]> {
    return this.lfs.promises.readdir(path);
  }

  async rm(path: string, options?: RmOptions): Promise<void> {
    try {
      const s = await this.lfs.promises.stat(path);
      if (s.isDirectory()) {
        if (options?.recursive) {
          await this.rmRecursive(path);
        } else {
          await this.lfs.promises.rmdir(path);
        }
      } else {
        await this.lfs.promises.unlink(path);
      }
    } catch (e: any) {
      if (!options?.force) throw e;
    }
    this.untrackPath(path);
  }

  private async rmRecursive(path: string): Promise<void> {
    const entries = await this.lfs.promises.readdir(path);
    for (const entry of entries) {
      const full = path + '/' + entry;
      const s = await this.lfs.promises.stat(full);
      if (s.isDirectory()) {
        await this.rmRecursive(full);
      } else {
        await this.lfs.promises.unlink(full);
      }
    }
    await this.lfs.promises.rmdir(path);
  }

  async cp(src: string, dest: string, options?: CpOptions): Promise<void> {
    const s = await this.lfs.promises.stat(src);
    if (s.isDirectory()) {
      if (!options?.recursive) throw new Error(`cp: -r not specified; omitting directory '${src}'`);
      await this.cpRecursive(src, dest);
    } else {
      const content = await this.lfs.promises.readFile(src);
      await this.lfs.promises.writeFile(dest, content as Uint8Array);
      this.trackPath(dest);
    }
  }

  private async cpRecursive(src: string, dest: string): Promise<void> {
    try { await this.lfs.promises.mkdir(dest); } catch { /* may exist */ }
    const entries = await this.lfs.promises.readdir(src);
    for (const entry of entries) {
      const srcPath = src + '/' + entry;
      const destPath = dest + '/' + entry;
      const s = await this.lfs.promises.stat(srcPath);
      if (s.isDirectory()) {
        await this.cpRecursive(srcPath, destPath);
      } else {
        const content = await this.lfs.promises.readFile(srcPath);
        await this.lfs.promises.writeFile(destPath, content as Uint8Array);
        this.trackPath(destPath);
      }
    }
  }

  async mv(src: string, dest: string): Promise<void> {
    await this.lfs.promises.rename(src, dest);
    this.untrackPath(src);
    this.trackPath(dest);
  }

  async chmod(_path: string, _mode: number): Promise<void> {}
  async utimes(_path: string, _atime: Date, _mtime: Date): Promise<void> {}

  async symlink(target: string, linkPath: string): Promise<void> {
    await this.lfs.promises.symlink(target, linkPath);
    this.trackPath(linkPath);
  }

  async link(_existingPath: string, _newPath: string): Promise<void> {
    throw new Error('hard links not supported');
  }

  async readlink(path: string): Promise<string> {
    return this.lfs.promises.readlink(path);
  }

  async realpath(path: string): Promise<string> {
    const parts = normalizePath(path).split('/').filter(Boolean);
    let resolved = '';
    for (const part of parts) {
      resolved += '/' + part;
      try {
        const s = await this.lfs.promises.lstat(resolved);
        if (s.isSymbolicLink()) {
          const target = await this.lfs.promises.readlink(resolved);
          resolved = target.startsWith('/') ? target : normalizePath(resolved + '/../' + target);
        }
      } catch {
        // path component doesn't exist
      }
    }
    return resolved;
  }

  resolvePath(base: string, path: string): string {
    return resolvePath(base, path);
  }

  getAllPaths(): string[] {
    return this.paths;
  }

  private trackPath(p: string) {
    if (!this.paths.includes(p)) this.paths.push(p);
  }

  private untrackPath(p: string) {
    const i = this.paths.indexOf(p);
    if (i !== -1) this.paths.splice(i, 1);
  }
}
