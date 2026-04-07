import { describe, it, expect } from 'vitest';
import { parseKey, parseSeq } from '../src/main/key-parser';

describe('parseKey — named keys', () => {
  // T-0660-10: every named key maps to correct bytes
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
    it(`${name} → correct bytes`, () => {
      expect(parseKey(name)).toBe(expected);
    });
  }

  it('case insensitive', () => {
    expect(parseKey('Enter')).toBe('\r');
    expect(parseKey('ESC')).toBe('\x1b');
    expect(parseKey('Ctrl-C')).toBe('\x03');
  });
});

describe('parseKey — unknown names fall through', () => {
  // T-0660-11
  it('single char passes through', () => {
    expect(parseKey('1')).toBe('1');
  });

  it('multi-char string passes through', () => {
    expect(parseKey('yes')).toBe('yes');
  });

  it('string with spaces passes through', () => {
    expect(parseKey('hello world')).toBe('hello world');
  });
});

describe('parseSeq — C-style escape sequences', () => {
  // T-0660-12
  it('\\x1b → ESC byte', () => {
    expect(parseSeq('\\x1b')).toBe('\x1b');
  });

  it('\\r → CR', () => {
    expect(parseSeq('\\r')).toBe('\r');
  });

  it('\\n → LF', () => {
    expect(parseSeq('\\n')).toBe('\n');
  });

  it('\\t → TAB', () => {
    expect(parseSeq('\\t')).toBe('\t');
  });

  it('\\\\ → literal backslash', () => {
    expect(parseSeq('\\\\')).toBe('\\');
  });

  it('\\x1b[A → arrow up (3 bytes)', () => {
    const result = parseSeq('\\x1b[A');
    expect(result).toBe('\x1b[A');
    expect(result.length).toBe(3);
  });

  // T-0660-13: edge cases
  it('empty string → empty string', () => {
    expect(parseSeq('')).toBe('');
  });

  it('plain text (no escapes) → verbatim', () => {
    expect(parseSeq('hello')).toBe('hello');
  });

  it('mixed: hello\\r\\n → hello + CR + LF', () => {
    expect(parseSeq('hello\\r\\n')).toBe('hello\r\n');
  });

  it('trailing \\x with < 2 hex chars → literal', () => {
    expect(parseSeq('\\x')).toBe('\\x');
  });
});
