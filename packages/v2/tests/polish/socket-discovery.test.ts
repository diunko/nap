import { describe, test, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { findSocketPath } from '../../src/shared/constants';

const cleanup: string[] = [];

function tmpDir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-disc-'));
  cleanup.push(d);
  return d;
}

afterEach(() => {
  for (const d of cleanup) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* ok */ }
  }
  cleanup.length = 0;
});

// T-0600-02: CLI walks up directories to find socket
describe('T-0600-02: findSocketPath walks up directories to find .nap/sock', () => {
  test('finds .nap/sock in parent when starting from /a/b/c/d/e', () => {
    const root = tmpDir();
    fs.mkdirSync(path.join(root, '.nap'));
    fs.writeFileSync(path.join(root, '.nap', 'sock'), '');

    const nested = path.join(root, 'a', 'b', 'c', 'd', 'e');
    fs.mkdirSync(nested, { recursive: true });

    expect(findSocketPath(nested)).toBe(path.join(root, '.nap', 'sock'));
  });

  test('finds .nap/sock in exact starting directory', () => {
    const root = tmpDir();
    fs.mkdirSync(path.join(root, '.nap'));
    fs.writeFileSync(path.join(root, '.nap', 'sock'), '');

    expect(findSocketPath(root)).toBe(path.join(root, '.nap', 'sock'));
  });

  test('returns closest .nap/sock — prefers child over grandparent', () => {
    const root = tmpDir();
    // Socket at root
    fs.mkdirSync(path.join(root, '.nap'));
    fs.writeFileSync(path.join(root, '.nap', 'sock'), '');
    // Socket at root/a (closer to start)
    fs.mkdirSync(path.join(root, 'a', '.nap'), { recursive: true });
    fs.writeFileSync(path.join(root, 'a', '.nap', 'sock'), '');
    // Start from root/a/b
    const start = path.join(root, 'a', 'b');
    fs.mkdirSync(start, { recursive: true });

    expect(findSocketPath(start)).toBe(path.join(root, 'a', '.nap', 'sock'));
  });

  test('path is resolved to absolute before walking', () => {
    const root = tmpDir();
    fs.mkdirSync(path.join(root, '.nap'));
    fs.writeFileSync(path.join(root, '.nap', 'sock'), '');
    const nested = path.join(root, 'sub');
    fs.mkdirSync(nested);

    expect(findSocketPath(nested)).toBe(path.join(root, '.nap', 'sock'));
  });
});

// T-0600-03: CLI errors when no socket found
describe('T-0600-03: findSocketPath returns null when no .nap/sock exists', () => {
  test('returns null for orphan temp directory', () => {
    const orphan = tmpDir();
    expect(findSocketPath(orphan)).toBeNull();
  });

  test('terminates at filesystem root without infinite loop', () => {
    const deep = path.join(os.tmpdir(), `no-nap-here-${Date.now()}`, 'a', 'b');
    expect(findSocketPath(deep)).toBeNull();
  });

  test('does NOT fall back to home directory socket', () => {
    // Even if ~/.nap/sock exists, an unrelated orphan dir must return null
    const orphan = tmpDir();
    expect(findSocketPath(orphan)).toBeNull();
  });
});
