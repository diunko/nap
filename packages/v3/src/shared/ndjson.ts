export type MessageCallback = (msg: unknown) => void;

export class NdjsonParser {
  private buffer = '';
  private readonly onMessage: MessageCallback;

  constructor(onMessage: MessageCallback) {
    this.onMessage = onMessage;
  }

  feed(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop()!;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        this.onMessage(JSON.parse(trimmed));
      } catch {
        // Skip malformed JSON lines
      }
    }
  }
}

export function serialize(msg: unknown): string {
  return JSON.stringify(msg) + '\n';
}
