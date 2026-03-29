import { describe, test, expect } from 'vitest';
import { NdjsonParser, serialize } from '../../src/shared/ndjson';

// T-0300-02: ndjson protocol handles split and concatenated messages
describe('T-0300-02: ndjson protocol handles split and concatenated messages', () => {
  test('split message: partial then remainder → one complete message', () => {
    const messages: unknown[] = [];
    const parser = new NdjsonParser((msg) => messages.push(msg));

    parser.feed('{"type":"ps","id":1');
    expect(messages).toHaveLength(0);

    parser.feed('}\n');
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({ type: 'ps', id: 1 });
  });

  test('concatenated: two messages in one chunk → two parsed messages', () => {
    const messages: unknown[] = [];
    const parser = new NdjsonParser((msg) => messages.push(msg));

    parser.feed('{"type":"ps","id":1}\n{"type":"ps","id":2}\n');
    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({ type: 'ps', id: 1 });
    expect(messages[1]).toEqual({ type: 'ps', id: 2 });
  });

  test('trailing partial: complete + incomplete → yields one, buffers rest', () => {
    const messages: unknown[] = [];
    const parser = new NdjsonParser((msg) => messages.push(msg));

    parser.feed('{"type":"ps","id":1}\n{"type":"ps"');
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({ type: 'ps', id: 1 });

    // Complete the buffered partial
    parser.feed(',"id":2}\n');
    expect(messages).toHaveLength(2);
    expect(messages[1]).toEqual({ type: 'ps', id: 2 });
  });

  test('empty lines: ignored, valid message still parsed', () => {
    const messages: unknown[] = [];
    const parser = new NdjsonParser((msg) => messages.push(msg));

    parser.feed('\n\n{"type":"ps","id":1}\n');
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({ type: 'ps', id: 1 });
  });

  test('serialize produces valid ndjson', () => {
    const line = serialize({ type: 'ps', id: 1 });
    expect(line).toBe('{"type":"ps","id":1}\n');
    expect(line.endsWith('\n')).toBe(true);
  });
});
