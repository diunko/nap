export type PtyWriter = (id: string, data: string) => void;

interface QueueEntry {
  messages: string[];
  delivering: boolean;
}

const queues = new Map<string, QueueEntry>();
const DELIVERY_DELAY_MS = 500;

let writeFn: PtyWriter | null = null;

export function setWriter(fn: PtyWriter): void {
  writeFn = fn;
}

export function enqueue(id: string, message: string): void {
  let entry = queues.get(id);
  if (!entry) {
    entry = { messages: [], delivering: false };
    queues.set(id, entry);
  }
  entry.messages.push(message);
  if (!entry.delivering) {
    deliverNext(id);
  }
}

function deliverNext(id: string): void {
  const entry = queues.get(id);
  if (!entry || entry.messages.length === 0) {
    if (entry) entry.delivering = false;
    return;
  }

  entry.delivering = true;
  const msg = entry.messages.shift()!;

  if (writeFn) {
    // Three-step delivery for raw-mode apps (Claude Code / Ink):
    // 1. Send text
    // 2. Escape to dismiss autocomplete
    // 3. CR to submit (Enter in raw mode)
    writeFn(id, msg);
    setTimeout(() => {
      if (writeFn) writeFn(id, '\x1b');  // Escape
      setTimeout(() => {
        if (writeFn) writeFn(id, '\r');  // Enter (CR, not LF)

        if (entry.messages.length > 0) {
          setTimeout(() => deliverNext(id), DELIVERY_DELAY_MS);
        } else {
          entry.delivering = false;
        }
      }, 100);
    }, 300);
    return;
  }

  if (entry.messages.length > 0) {
    setTimeout(() => deliverNext(id), DELIVERY_DELAY_MS);
  } else {
    entry.delivering = false;
  }
}

export function clearQueue(id: string): void {
  queues.delete(id);
}
