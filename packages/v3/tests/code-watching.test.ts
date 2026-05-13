/**
 * Code file watching — small tests
 *
 * Tests ContentWatcher module (from content-watcher.ts, uses @parcel/watcher).
 * The fullstack engineer reused this for both left pane (content) and right pane (code).
 *
 * W01-W04 test the watcher via real temp files (same pattern as 0100 content-watching tests).
 * W06 tests that two watcher instances are independent.
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ContentWatcher } from '../src/main/content-watcher';

let tmpDir: string;
let cleanups: (() => Promise<void> | void)[] = [];

function setup(): string {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-code-watch-'));
  return tmpDir;
}

afterEach(async () => {
  for (const fn of cleanups) await fn();
  cleanups = [];
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('Code file watching — ContentWatcher', () => {
  // T-0200-W01: file change triggers callback
  it('W01: external file change triggers callback', async () => {
    const dir = setup();
    const filePath = path.join(dir, 'code.ts');
    fs.writeFileSync(filePath, 'const x = 1;');

    const received: string[] = [];
    const watcher = new ContentWatcher({
      onChange: (_path, content) => received.push(content),
      isPendingWrite: () => false,
      debounceMs: 100,
    });
    await watcher.watch(filePath);
    cleanups.push(() => watcher.stop());

    // Wait for watcher to be ready
    await new Promise((r) => setTimeout(r, 200));

    // External change
    fs.writeFileSync(filePath, 'const x = 2;');

    // Wait for debounce
    await new Promise((r) => setTimeout(r, 500));

    expect(received.length).toBeGreaterThanOrEqual(1);
    expect(received[received.length - 1]).toBe('const x = 2;');
  });

  // T-0200-W02: atomic writes detected (temp+rename)
  it('W02: atomic write (temp+rename) triggers callback', async () => {
    const dir = setup();
    const filePath = path.join(dir, 'code.ts');
    fs.writeFileSync(filePath, 'original');

    const received: string[] = [];
    const watcher = new ContentWatcher({
      onChange: (_path, content) => received.push(content),
      isPendingWrite: () => false,
      debounceMs: 100,
    });
    await watcher.watch(filePath);
    cleanups.push(() => watcher.stop());

    await new Promise((r) => setTimeout(r, 200));

    // Atomic write: temp file + rename (Claude Code pattern)
    const tmpFile = filePath + '.tmp';
    fs.writeFileSync(tmpFile, 'atomic update');
    fs.renameSync(tmpFile, filePath);

    await new Promise((r) => setTimeout(r, 500));

    expect(received.length).toBeGreaterThanOrEqual(1);
    expect(received[received.length - 1]).toBe('atomic update');
  });

  // T-0200-W03: stop watching on file close
  it('W03: watcher stops — no more callbacks after stop', async () => {
    const dir = setup();
    const filePath = path.join(dir, 'code.ts');
    fs.writeFileSync(filePath, 'original');

    const received: string[] = [];
    const watcher = new ContentWatcher({
      onChange: (_path, content) => received.push(content),
      isPendingWrite: () => false,
      debounceMs: 100,
    });
    await watcher.watch(filePath);

    await new Promise((r) => setTimeout(r, 200));

    // Stop watching
    await watcher.stop();

    // Change file after stop
    fs.writeFileSync(filePath, 'should not trigger');

    await new Promise((r) => setTimeout(r, 400));

    expect(received).toHaveLength(0);
  });

  // T-0200-W04: debounce rapid changes
  it('W04: rapid changes debounce to single callback', async () => {
    const dir = setup();
    const filePath = path.join(dir, 'code.ts');
    fs.writeFileSync(filePath, 'v0');

    const received: string[] = [];
    const watcher = new ContentWatcher({
      onChange: (_path, content) => received.push(content),
      isPendingWrite: () => false,
      debounceMs: 150,
    });
    await watcher.watch(filePath);
    cleanups.push(() => watcher.stop());

    await new Promise((r) => setTimeout(r, 200));

    // 5 rapid writes
    for (let i = 1; i <= 5; i++) {
      fs.writeFileSync(filePath, `v${i}`);
      await new Promise((r) => setTimeout(r, 20));
    }

    // Wait for debounce to settle
    await new Promise((r) => setTimeout(r, 500));

    // Should have received final content (may fire once or twice depending on timing,
    // but the last received should be v5)
    expect(received.length).toBeGreaterThanOrEqual(1);
    expect(received[received.length - 1]).toBe('v5');
  });

  // T-0200-W06: Left and right pane watchers share ContentWatcher module independently
  it('W06: two watcher instances are independent', async () => {
    const dir = setup();
    const fileA = path.join(dir, 'left.md');
    const fileB = path.join(dir, 'right.ts');
    fs.writeFileSync(fileA, 'left original');
    fs.writeFileSync(fileB, 'right original');

    const leftReceived: string[] = [];
    const rightReceived: string[] = [];
    let suppressLeft = false;

    const leftWatcher = new ContentWatcher({
      onChange: (_path, content) => leftReceived.push(content),
      isPendingWrite: () => suppressLeft,
      debounceMs: 100,
    });
    const rightWatcher = new ContentWatcher({
      onChange: (_path, content) => rightReceived.push(content),
      isPendingWrite: () => false, // read-only, no echo suppression
      debounceMs: 100,
    });

    await leftWatcher.watch(fileA);
    await rightWatcher.watch(fileB);
    cleanups.push(() => leftWatcher.stop());
    cleanups.push(() => rightWatcher.stop());

    await new Promise((r) => setTimeout(r, 200));

    // Write to right pane file — should trigger right callback
    fs.writeFileSync(fileB, 'right updated');
    await new Promise((r) => setTimeout(r, 400));

    expect(rightReceived.length).toBeGreaterThanOrEqual(1);
    expect(rightReceived[rightReceived.length - 1]).toBe('right updated');

    // Write to left pane file WITH suppression — should NOT trigger left callback
    suppressLeft = true;
    fs.writeFileSync(fileA, 'left saved by editor');
    await new Promise((r) => setTimeout(r, 400));

    expect(leftReceived).toHaveLength(0); // suppressed

    // Left suppression does not affect right watcher
    fs.writeFileSync(fileB, 'right updated again');
    await new Promise((r) => setTimeout(r, 400));
    expect(rightReceived.length).toBeGreaterThanOrEqual(2);
  });
});
