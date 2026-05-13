import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ContentWatcher } from '../src/main/content-watcher';

let tmpDir: string;
let watchers: ContentWatcher[] = [];

function setup(): string {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-cw-test-'));
  return tmpDir;
}

function makeWatcher(
  onChange: (fp: string, content: string) => void,
  opts?: { isPendingWrite?: (fp: string) => boolean; debounceMs?: number },
): ContentWatcher {
  const w = new ContentWatcher({
    onChange,
    isPendingWrite: opts?.isPendingWrite ?? (() => false),
    debounceMs: opts?.debounceMs ?? 100, // tight debounce for tests
  });
  watchers.push(w);
  return w;
}

afterEach(async () => {
  for (const w of watchers) await w.stop();
  watchers = [];
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('ContentWatcher', () => {
  // 1. Direct write (writeFileSync)
  it('detects direct write', async () => {
    const dir = setup();
    const fp = path.join(dir, 'test.md');
    fs.writeFileSync(fp, 'original');

    const received: string[] = [];
    const w = makeWatcher((_, content) => received.push(content));
    await w.watch(fp);

    await new Promise((r) => setTimeout(r, 100));
    fs.writeFileSync(fp, 'updated');
    await new Promise((r) => setTimeout(r, 300));

    expect(received).toHaveLength(1);
    expect(received[0]).toBe('updated');
  });

  // 2. Atomic write (temp + rename) — the Claude Code case
  it('detects atomic write (temp+rename)', async () => {
    const dir = setup();
    const fp = path.join(dir, 'test.md');
    fs.writeFileSync(fp, 'original');

    const received: string[] = [];
    const w = makeWatcher((_, content) => received.push(content));
    await w.watch(fp);

    await new Promise((r) => setTimeout(r, 100));
    const tmp = fp + '.tmp';
    fs.writeFileSync(tmp, 'atomic update');
    fs.renameSync(tmp, fp);
    await new Promise((r) => setTimeout(r, 300));

    expect(received).toHaveLength(1);
    expect(received[0]).toBe('atomic update');
  });

  // 3. Multiple atomic writes in rapid succession — debounce to one
  it('debounces rapid atomic writes to single callback', async () => {
    const dir = setup();
    const fp = path.join(dir, 'test.md');
    fs.writeFileSync(fp, 'v0');

    const received: string[] = [];
    // Longer debounce — parcel event batches can be spaced ~100ms apart
    const w = makeWatcher((_, content) => received.push(content), { debounceMs: 250 });
    await w.watch(fp);

    await new Promise((r) => setTimeout(r, 100));
    for (let i = 1; i <= 5; i++) {
      const tmp = fp + '.tmp';
      fs.writeFileSync(tmp, `v${i}`);
      fs.renameSync(tmp, fp);
      await new Promise((r) => setTimeout(r, 20));
    }
    await new Promise((r) => setTimeout(r, 500));

    expect(received).toHaveLength(1);
    expect(received[0]).toBe('v5');
  });

  // 4. Git checkout — delete + write new content at same path
  it('detects git-checkout-style replacement', async () => {
    const dir = setup();
    const fp = path.join(dir, 'test.md');
    fs.writeFileSync(fp, 'before checkout');

    const received: string[] = [];
    const w = makeWatcher((_, content) => received.push(content));
    await w.watch(fp);

    await new Promise((r) => setTimeout(r, 100));
    // git checkout: unlink + write new file
    fs.unlinkSync(fp);
    fs.writeFileSync(fp, 'after checkout');
    await new Promise((r) => setTimeout(r, 300));

    expect(received.length).toBeGreaterThanOrEqual(1);
    expect(received[received.length - 1]).toBe('after checkout');
  });

  // 5. File deleted then recreated
  it('detects file recreated after delete', async () => {
    const dir = setup();
    const fp = path.join(dir, 'test.md');
    fs.writeFileSync(fp, 'original');

    const received: string[] = [];
    const w = makeWatcher((_, content) => received.push(content));
    await w.watch(fp);

    await new Promise((r) => setTimeout(r, 100));
    fs.unlinkSync(fp);
    await new Promise((r) => setTimeout(r, 50));
    fs.writeFileSync(fp, 'recreated');
    await new Promise((r) => setTimeout(r, 300));

    expect(received.length).toBeGreaterThanOrEqual(1);
    expect(received[received.length - 1]).toBe('recreated');
  });

  // 6. Echo suppression — own writes don't trigger callback
  it('suppresses echo from pending writes', async () => {
    const dir = setup();
    const fp = path.join(dir, 'test.md');
    fs.writeFileSync(fp, 'original');

    const pending = new Set<string>();
    const received: string[] = [];
    const w = makeWatcher(
      (_, content) => received.push(content),
      { isPendingWrite: (p) => pending.has(p) },
    );
    await w.watch(fp);

    await new Promise((r) => setTimeout(r, 100));
    pending.add(fp);
    fs.writeFileSync(fp, 'self-write');
    await new Promise((r) => setTimeout(r, 300));
    pending.delete(fp);

    expect(received).toHaveLength(0);
  });

  // 7. Switch watched file — old file edits ignored, new file edits detected
  it('only fires for currently watched file after switch', async () => {
    const dir = setup();
    const fpA = path.join(dir, 'a.md');
    const fpB = path.join(dir, 'b.md');
    fs.writeFileSync(fpA, 'a-original');
    fs.writeFileSync(fpB, 'b-original');

    const received: Array<{ path: string; content: string }> = [];
    const w = makeWatcher((p, content) => received.push({ path: p, content }));

    await w.watch(fpA);
    await new Promise((r) => setTimeout(r, 100));

    // Switch to B
    await w.watch(fpB);
    await new Promise((r) => setTimeout(r, 100));

    // Edit A — should be ignored
    fs.writeFileSync(fpA, 'a-edited');
    await new Promise((r) => setTimeout(r, 200));

    // Edit B — should fire
    fs.writeFileSync(fpB, 'b-edited');
    await new Promise((r) => setTimeout(r, 300));

    expect(received).toHaveLength(1);
    expect(received[0].path).toBe(fpB);
    expect(received[0].content).toBe('b-edited');
  });
});
