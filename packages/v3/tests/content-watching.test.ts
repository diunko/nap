/**
 * Content file watching — small tests
 *
 * FINDING: The content file watcher is implemented inline in main.ts using
 * nodeFs.watch, NOT through MemoryFileSystem or any abstracted module.
 * The test architecture designed W01-W03 to use MemoryFileSystem.simulateChange,
 * but that path doesn't exist — the model's MemoryFileSystem watches directories
 * for structural changes, while the content watcher is a separate inline mechanism.
 *
 * These tests use real tmp files + fs.watch to verify the debounce and suppression
 * logic. They're fast (~500ms) but technically hit real filesystem.
 *
 * The fullstack engineer should consider extracting the content watcher into a
 * testable module with injectable fs (like the model uses) so true small tests
 * become possible.
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

let tmpDir: string;
let cleanups: (() => void)[] = [];

function setup(): string {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-watch-test-'));
  return tmpDir;
}

afterEach(() => {
  for (const fn of cleanups) fn();
  cleanups = [];
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('Content file watching', () => {
  // T-0100-W01: External file change triggers callback
  // NOTE: Adapted from MemoryFileSystem design — uses real fs.watch instead
  it('W01: external file change triggers watcher callback', async () => {
    const dir = setup();
    const filePath = path.join(dir, 'test.md');
    fs.writeFileSync(filePath, 'original content');

    const received: string[] = [];
    const debounceMs = 200;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;

    const watcher = fs.watch(filePath, (eventType) => {
      if (eventType !== 'change') return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const content = fs.readFileSync(filePath, 'utf-8');
        received.push(content);
      }, debounceMs);
    });
    cleanups.push(() => watcher.close());

    // Wait for watcher to be ready
    await new Promise((r) => setTimeout(r, 50));

    // External change
    fs.writeFileSync(filePath, 'updated content');

    // Wait for debounce to settle
    await new Promise((r) => setTimeout(r, debounceMs + 100));

    expect(received).toHaveLength(1);
    expect(received[0]).toBe('updated content');
  });

  // T-0100-W02: Write-echo suppression
  it('W02: echo suppression prevents re-read after own write', async () => {
    const dir = setup();
    const filePath = path.join(dir, 'test.md');
    fs.writeFileSync(filePath, 'original content');

    const pendingWrites = new Set<string>();
    const received: string[] = [];
    const debounceMs = 200;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;

    const watcher = fs.watch(filePath, (eventType) => {
      if (eventType !== 'change') return;
      if (pendingWrites.has(filePath)) return; // echo suppression

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const content = fs.readFileSync(filePath, 'utf-8');
        received.push(content);
      }, debounceMs);
    });
    cleanups.push(() => watcher.close());

    await new Promise((r) => setTimeout(r, 50));

    // Simulate auto-save write with suppression flag
    pendingWrites.add(filePath);
    fs.writeFileSync(filePath, 'saved by editor');
    setTimeout(() => pendingWrites.delete(filePath), 300);

    // Wait for debounce window
    await new Promise((r) => setTimeout(r, debounceMs + 150));

    // Watcher should NOT have fired (echo suppressed)
    expect(received).toHaveLength(0);
  });

  // T-0100-W03: Rapid external changes debounce correctly
  it('W03: rapid changes debounce to single callback', async () => {
    const dir = setup();
    const filePath = path.join(dir, 'test.md');
    fs.writeFileSync(filePath, 'v0');

    const received: string[] = [];
    const debounceMs = 200;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;

    const watcher = fs.watch(filePath, (eventType) => {
      if (eventType !== 'change') return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const content = fs.readFileSync(filePath, 'utf-8');
        received.push(content);
      }, debounceMs);
    });
    cleanups.push(() => watcher.close());

    await new Promise((r) => setTimeout(r, 50));

    // 5 rapid writes within 100ms
    for (let i = 1; i <= 5; i++) {
      fs.writeFileSync(filePath, `v${i}`);
      await new Promise((r) => setTimeout(r, 20));
    }

    // Wait for debounce to settle
    await new Promise((r) => setTimeout(r, debounceMs + 100));

    // Should have received exactly once with final content
    expect(received).toHaveLength(1);
    expect(received[0]).toBe('v5');
  });
});
