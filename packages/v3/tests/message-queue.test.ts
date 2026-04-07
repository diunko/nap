import { describe, it, expect } from 'vitest';
import { setWriter, enqueue, clearQueue } from '../src/main/message-queue';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('Message queue', () => {
  // T-0210-55 (updated: default poke is text → CR, no ESC)
  it('poke delivers text → CR (no ESC by default)', async () => {
    const writes: string[] = [];
    setWriter((_id, data) => writes.push(data));

    enqueue('uuid-ta', 'hello');
    await sleep(1000);

    expect(writes).toEqual(['hello', '\r']);

    // Cleanup
    setWriter(() => {});
  });

  it('poke with esc=true delivers text → ESC → CR', async () => {
    const writes: string[] = [];
    setWriter((_id, data) => writes.push(data));

    enqueue('uuid-ta-esc', 'hello', true);
    await sleep(1000);

    expect(writes).toEqual(['hello', '\x1b', '\r']);

    // Cleanup
    setWriter(() => {});
  });

  // T-0210-56
  it('multiple poke messages delivered sequentially', async () => {
    const writes: Array<{ id: string; data: string }> = [];
    setWriter((id, data) => writes.push({ id, data }));

    enqueue('uuid-ta', 'msg1');
    enqueue('uuid-ta', 'msg2');
    await sleep(2500);

    // msg1 cycle then msg2 cycle (no ESC)
    expect(writes.map(w => w.data)).toEqual(['msg1', '\r', 'msg2', '\r']);

    // Cleanup
    setWriter(() => {});
  });

  // T-0210-57
  it('clearQueue stops pending deliveries', async () => {
    const writes: Array<{ id: string; data: string }> = [];
    setWriter((id, data) => writes.push({ id, data }));

    enqueue('uuid-clear', 'msg1');
    enqueue('uuid-clear', 'msg2');
    await sleep(500); // mid-first-delivery
    clearQueue('uuid-clear');
    await sleep(2000);

    // Only msg1's cycle
    expect(writes.filter(w => w.data === 'msg2')).toHaveLength(0);

    // Cleanup
    setWriter(() => {});
  });
});
