export type PtyWriter = (id: string, data: string) => void;

interface QueueEntry {
  messages: Array<{ text: string; esc: boolean }>;
  delivering: boolean;
}

const queues = new Map<string, QueueEntry>();
const DELIVERY_DELAY_MS = 500;

let writeFn: PtyWriter | null = null;

export function setWriter(fn: PtyWriter): void {
  writeFn = fn;
}

export function enqueue(id: string, message: string, esc = false): void {
  let entry = queues.get(id);
  if (!entry) {
    entry = { messages: [], delivering: false };
    queues.set(id, entry);
  }
  entry.messages.push({ text: message, esc });
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
  const { text, esc } = entry.messages.shift()!;

  if (writeFn) {
    // Two-step delivery: text → CR (Enter in raw mode)
    // Optional ESC step (--esc flag) for dismissing autocomplete
    writeFn(id, text);
    const afterText = () => {
      if (esc && writeFn) {
        writeFn(id, '\x1b'); // Escape
        setTimeout(() => {
          if (writeFn) writeFn(id, '\r'); // Enter
          scheduleNext();
        }, 100);
      } else {
        if (writeFn) writeFn(id, '\r'); // Enter
        scheduleNext();
      }
    };

    function scheduleNext(): void {
      if (entry!.messages.length > 0) {
        setTimeout(() => deliverNext(id), DELIVERY_DELAY_MS);
      } else {
        entry!.delivering = false;
      }
    }

    setTimeout(afterText, 300);
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
