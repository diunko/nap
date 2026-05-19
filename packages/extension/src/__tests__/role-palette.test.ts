/**
 * Role palette tests — roleDecoClass, hashPrefix, roleColor, generatePaletteCss.
 */
import { describe, it, expect } from 'vitest';
import {
  roleDecoClass,
  hashPrefix,
  roleColor,
  generatePaletteCss,
  PALETTE_SIZE,
} from '../role-palette';

describe('roleDecoClass', () => {
  it('returns known-prefix class for A', () => {
    expect(roleDecoClass('A')).toBe('role-deco-known-A');
  });

  it('returns known-prefix class for DU', () => {
    expect(roleDecoClass('DU')).toBe('role-deco-known-DU');
  });

  it('A and DU produce different classes', () => {
    expect(roleDecoClass('A')).not.toBe(roleDecoClass('DU'));
  });

  it('returns hash-based class for unknown prefix', () => {
    const cls = roleDecoClass('FOO');
    expect(cls).toMatch(/^role-deco-\d+$/);
  });
});

describe('hashPrefix', () => {
  it('is deterministic — same prefix always same index', () => {
    expect(hashPrefix('FOO')).toBe(hashPrefix('FOO'));
    expect(hashPrefix('BAR')).toBe(hashPrefix('BAR'));
  });

  it('produces values in range 0 to PALETTE_SIZE-1', () => {
    for (const p of ['A', 'DU', 'FOO', 'XYZ', 'LONGPREFIX', 'a']) {
      const idx = hashPrefix(p);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(PALETTE_SIZE);
    }
  });
});

describe('roleColor', () => {
  it('returns fixed blue for A (light theme)', () => {
    expect(roleColor('A', false)).toBe('#2563eb');
  });

  it('returns fixed green for DU (light theme)', () => {
    expect(roleColor('DU', false)).toBe('#16a34a');
  });

  it('returns fixed orange for TA (light theme)', () => {
    expect(roleColor('TA', false)).toBe('#d97706');
  });

  it('returns HSL color for unknown prefix', () => {
    const color = roleColor('UNKNOWN', false);
    expect(color).toMatch(/^hsl\(\d+, 55%, 40%\)$/);
  });

  it('dark mode returns different colors for known prefixes', () => {
    expect(roleColor('A', true)).toBe('#3b82f6');
    expect(roleColor('DU', true)).toBe('#22c55e');
  });
});

describe('generatePaletteCss', () => {
  it('contains 20 palette hue rules', () => {
    const css = generatePaletteCss(false);
    for (let i = 0; i < PALETTE_SIZE; i++) {
      expect(css).toContain(`.role-deco-${i}`);
    }
  });

  it('contains known-prefix overrides', () => {
    const css = generatePaletteCss(false);
    expect(css).toContain('.role-deco-known-A { color: #2563eb');
    expect(css).toContain('.role-deco-known-DU { color: #16a34a');
    expect(css).toContain('.role-deco-known-TA { color: #d97706');
  });

  it('uses !important on all rules', () => {
    const css = generatePaletteCss(false);
    const lines = css.split('\n');
    for (const line of lines) {
      expect(line).toContain('!important');
    }
  });
});
