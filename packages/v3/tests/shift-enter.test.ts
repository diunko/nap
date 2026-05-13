import { describe, it, expect, vi } from 'vitest';

// Mock monaco-editor — napkin-markdown imports it at top level but detectLinePattern doesn't use it
vi.mock('monaco-editor', () => ({
  default: {},
  languages: { register: vi.fn(), setMonarchTokensProvider: vi.fn() },
  editor: { defineTheme: vi.fn() },
  KeyMod: { Shift: 0 },
  KeyCode: { Enter: 0 },
  Range: class { constructor() {} },
  Position: class { constructor() {} },
}));

import { detectLinePattern } from '../src/renderer/napkin-markdown';

// ── 5. Shift-enter continuation — detectLinePattern (small tests) ──

describe('Shift-enter — detectLinePattern', () => {
  // T-0200-SE01: Detect indent + bullet + prefix
  describe('SE01: full pattern — indent + bullet + prefix', () => {
    it('parses "  * //DU: some thought"', () => {
      const result = detectLinePattern('  * //DU: some thought');
      expect(result.indent).toBe('  ');
      expect(result.bullet).toBe('* ');
      expect(result.prefix).toBe('//DU: ');
      expect(result.content).toBe('some thought');
    });

    it('parses "    * //A: architecture note"', () => {
      const result = detectLinePattern('    * //A: architecture note');
      expect(result.indent).toBe('    ');
      expect(result.bullet).toBe('* ');
      expect(result.prefix).toBe('//A: ');
      expect(result.content).toBe('architecture note');
    });

    it('parses "  * //FS: code detail"', () => {
      const result = detectLinePattern('  * //FS: code detail');
      expect(result.indent).toBe('  ');
      expect(result.bullet).toBe('* ');
      expect(result.prefix).toBe('//FS: ');
      expect(result.content).toBe('code detail');
    });

    it('parses "  * //TA: test thought"', () => {
      const result = detectLinePattern('  * //TA: test thought');
      expect(result.prefix).toBe('//TA: ');
    });

    it('parses "  * //TE: test thought"', () => {
      const result = detectLinePattern('  * //TE: test thought');
      expect(result.prefix).toBe('//TE: ');
    });
  });

  // T-0200-SE02: Line with bullet, no prefix
  describe('SE02: bullet without prefix', () => {
    it('parses "    * some text"', () => {
      const result = detectLinePattern('    * some text');
      expect(result.indent).toBe('    ');
      expect(result.bullet).toBe('* ');
      expect(result.prefix).toBe('');
      expect(result.content).toBe('some text');
    });

    it('parses "  * a simple bullet"', () => {
      const result = detectLinePattern('  * a simple bullet');
      expect(result.indent).toBe('  ');
      expect(result.bullet).toBe('* ');
      expect(result.prefix).toBe('');
      expect(result.content).toBe('a simple bullet');
    });
  });

  // T-0200-SE03: Line with indent only, no bullet
  describe('SE03: indent only', () => {
    it('parses "    some text" → indent only', () => {
      const result = detectLinePattern('    some text');
      expect(result.indent).toBe('    ');
      expect(result.bullet).toBe('');
      expect(result.prefix).toBe('');
      expect(result.content).toBe('some text');
    });

    it('parses empty line', () => {
      const result = detectLinePattern('');
      expect(result.indent).toBe('');
      expect(result.bullet).toBe('');
      expect(result.prefix).toBe('');
      expect(result.content).toBe('');
    });

    it('parses text with no indent', () => {
      const result = detectLinePattern('top level text');
      expect(result.indent).toBe('');
      expect(result.bullet).toBe('');
      expect(result.prefix).toBe('');
      expect(result.content).toBe('top level text');
    });
  });

  // T-0200-SE04: Break-out — empty line after prefix
  describe('SE04: break-out detection — empty after prefix', () => {
    it('"  * //DU: " → content is empty (break-out condition)', () => {
      const result = detectLinePattern('  * //DU: ');
      expect(result.indent).toBe('  ');
      expect(result.bullet).toBe('* ');
      expect(result.prefix).toBe('//DU: ');
      expect(result.content).toBe('');
    });

    it('"    * //A: " → content is empty', () => {
      const result = detectLinePattern('    * //A: ');
      expect(result.content).toBe('');
    });

    it('break-out: content is whitespace-only counts as empty', () => {
      // The regex captures trailing content — check trimmed
      const result = detectLinePattern('  * //DU:   ');
      // Depending on regex, prefix might absorb the space after colon
      // The pattern is //\w+: (with trailing space) so extra spaces go to content
      const hasContent = result.content.trim().length > 0;
      // Either way, break-out logic checks content.trim() === ''
      expect(hasContent).toBe(false);
    });
  });

  // T-0200-SE05: Break-out — empty bullet without prefix
  describe('SE05: break-out — bullet only, no content', () => {
    it('"  * " → bullet with no content (break-out)', () => {
      const result = detectLinePattern('  * ');
      expect(result.indent).toBe('  ');
      expect(result.bullet).toBe('* ');
      expect(result.prefix).toBe('');
      expect(result.content).toBe('');
    });

    it('"* " → bullet at root level, no content', () => {
      const result = detectLinePattern('* ');
      expect(result.bullet).toBe('* ');
      expect(result.content).toBe('');
    });
  });

  // Additional: does NOT match // comments without role tag as prefix
  describe('does not false-positive on generic comments', () => {
    it('"  * // just a comment" → no prefix detected', () => {
      const result = detectLinePattern('  * // just a comment');
      // "// just a comment" should not match //XX: pattern
      // The regex is /\/\/\w+: / — requires word chars then colon-space
      // "// " has a space after //, so \w+ won't match
      expect(result.prefix).toBe('');
    });
  });
});
