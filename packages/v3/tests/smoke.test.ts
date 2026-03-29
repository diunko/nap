import { describe, it, expect } from 'vitest';
import { NdjsonParser, serialize } from '../src/shared/ndjson';

describe('ndjson round-trip', () => {
  it('serializes and parses a message', () => {
    const msg = { type: 'hello', id: 1, data: [1, 2, 3] };
    const serialized = serialize(msg);

    let received: unknown = null;
    const parser = new NdjsonParser((m) => {
      received = m;
    });

    parser.feed(serialized);
    expect(received).toEqual(msg);
  });
});
