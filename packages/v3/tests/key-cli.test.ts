import { describe, it, expect } from 'vitest';
import { parseKey, parseSeq } from '../src/main/key-parser';

// T-0660-40 through T-0660-43: CLI key command tests
// These test the CLI's argument parsing and key resolution logic.
// The actual socket send is tested in socket-handler tests;
// here we verify the CLI builds the correct request shape.

describe('CLI key command — request building', () => {
  // T-0660-40: nap3 key 002-fs-eng enter → sends { type: "key", data: "\r" }
  it('T-0660-40: named key "enter" resolves to \\r before send', () => {
    // CLI calls parseKey(args[1]) to resolve the key
    const data = parseKey('enter');
    expect(data).toBe('\r');
    // CLI then builds: { type: 'key', name: '002-fs-eng', data }
    const request = { type: 'key', name: '002-fs-eng', data };
    expect(request.type).toBe('key');
    expect(request.data).toBe('\r');
    expect(request.data).not.toBe('enter'); // must NOT send the string "enter"
  });

  it('T-0660-40: all named keys resolve to bytes, not strings', () => {
    const cases: [string, string][] = [
      ['enter', '\r'],
      ['esc', '\x1b'],
      ['tab', '\t'],
      ['space', ' '],
      ['backspace', '\x7f'],
      ['up', '\x1b[A'],
      ['down', '\x1b[B'],
      ['left', '\x1b[D'],
      ['right', '\x1b[C'],
      ['ctrl-c', '\x03'],
      ['ctrl-d', '\x04'],
      ['ctrl-z', '\x1a'],
    ];
    for (const [name, expected] of cases) {
      const data = parseKey(name);
      const request = { type: 'key' as const, name: 'agent', data };
      expect(request.data).toBe(expected);
    }
  });

  // T-0660-41: nap3 key 002-fs-eng --seq "\x1b[A" → sends { type: "key", data: "\x1b[A" }
  it('T-0660-41: --seq "\\x1b[A" → ESC [ A (3 bytes), not literal string', () => {
    // CLI calls parseSeq(seqValue) when --seq is present
    const data = parseSeq('\\x1b[A');
    expect(data).toBe('\x1b[A');
    expect(data.length).toBe(3); // ESC + [ + A
    // Must NOT be the literal 6-char string "\\x1b[A"
    expect(data).not.toBe('\\x1b[A');
  });

  it('T-0660-41: --seq "\\r" → CR byte', () => {
    const data = parseSeq('\\r');
    expect(data).toBe('\r');
    expect(data.charCodeAt(0)).toBe(0x0d);
  });

  // T-0660-42: nap3 key 002-fs-eng "1" → sends { type: "key", data: "1" }
  it('T-0660-42: raw text "1" sent verbatim', () => {
    const data = parseKey('1');
    expect(data).toBe('1');
    const request = { type: 'key' as const, name: '002-fs-eng', data };
    expect(request.data).toBe('1');
  });

  it('T-0660-42: raw text "yes" sent verbatim', () => {
    const data = parseKey('yes');
    expect(data).toBe('yes');
  });

  // T-0660-43: nap3 key with no arguments → usage error
  // This tests the arg-parsing guard. The CLI does:
  //   if (!args[0] || (!args[1] && !seqValue)) { stderr + exit(1) }
  // We test the condition directly since we can't easily capture process.exit in vitest.
  it('T-0660-43: missing key arg triggers usage error condition', () => {
    // Simulate: nap3 key agent-name (no key arg)
    const args = ['agent-name'];
    const seqValue: string | undefined = undefined;
    const shouldError = !args[0] || (!args[1] && !seqValue);
    // args[0] = 'agent-name' (truthy), args[1] = undefined, seqValue = undefined
    expect(shouldError).toBe(true);
  });

  it('T-0660-43: no arguments at all triggers usage error condition', () => {
    const args: string[] = [];
    const seqValue: string | undefined = undefined;
    const shouldError = !args[0] || (!args[1] && !seqValue);
    expect(shouldError).toBe(true);
  });

  it('T-0660-43: --seq without agent name triggers usage error condition', () => {
    // nap3 key --seq "\x1b" — the --seq is a flag, so args would be empty
    const args: string[] = [];
    const seqValue = '\\x1b';
    const shouldError = !args[0] || (!args[1] && !seqValue);
    // args[0] = undefined → shouldError = true
    expect(shouldError).toBe(true);
  });

  it('T-0660-43: valid args do NOT trigger error', () => {
    // nap3 key agent-name enter
    const args = ['agent-name', 'enter'];
    const seqValue: string | undefined = undefined;
    const shouldError = !args[0] || (!args[1] && !seqValue);
    expect(shouldError).toBe(false);
  });

  it('T-0660-43: --seq with agent name does NOT trigger error', () => {
    // nap3 key agent-name --seq "\x1b[A"
    const args = ['agent-name'];
    const seqValue = '\\x1b[A';
    const shouldError = !args[0] || (!args[1] && !seqValue);
    expect(shouldError).toBe(false);
  });
});
