import { describe, it, expect } from 'vitest';
import {
  hashPrefix,
  roleColor,
  roleColorByIndex,
  roleCssClass,
  roleDecoClass,
  generatePaletteCss,
  PALETTE_SIZE,
} from '../src/renderer/role-palette';

// ── Role palette — small tests ──

// T-ROLE-01: hashPrefix is deterministic
describe('ROLE-01: hashPrefix is deterministic', () => {
  it('same prefix returns same index on repeated calls', () => {
    const a = hashPrefix('A');
    expect(hashPrefix('A')).toBe(a);
    expect(hashPrefix('A')).toBe(a);
  });

  it('returns a number in range [0, 19]', () => {
    for (const prefix of ['A', 'DU', 'FS', 'TA', 'TE', 'E', 'PM', 'QA', 'X', 'LONG_PREFIX']) {
      const idx = hashPrefix(prefix);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(PALETTE_SIZE);
    }
  });

  it('different prefixes produce different indices (spot check)', () => {
    const indices = new Set(['DU', 'E', 'PM', 'QA'].map(hashPrefix));
    // With 20 buckets and 4 short strings, collisions are unlikely
    expect(indices.size).toBeGreaterThanOrEqual(3);
  });
});

// T-ROLE-02: Known prefixes return fixed colors
describe('ROLE-02: Known prefixes return fixed colors', () => {
  it('A dark → #3b82f6', () => {
    expect(roleColor('A', true)).toBe('#3b82f6');
  });

  it('A light → #2563eb', () => {
    expect(roleColor('A', false)).toBe('#2563eb');
  });

  it('DU dark → #22c55e (bright green)', () => {
    expect(roleColor('DU', true)).toBe('#22c55e');
  });

  it('DU light → #16a34a', () => {
    expect(roleColor('DU', false)).toBe('#16a34a');
  });

  it('FS dark → #22c55e', () => {
    expect(roleColor('FS', true)).toBe('#22c55e');
  });

  it('FS light → #16a34a', () => {
    expect(roleColor('FS', false)).toBe('#16a34a');
  });

  it('TA dark → #f59e0b', () => {
    expect(roleColor('TA', true)).toBe('#f59e0b');
  });

  it('TA light → #d97706', () => {
    expect(roleColor('TA', false)).toBe('#d97706');
  });

  it('TE dark → #6b7280', () => {
    expect(roleColor('TE', true)).toBe('#6b7280');
  });

  it('TE light → #6b7280', () => {
    expect(roleColor('TE', false)).toBe('#6b7280');
  });
});

// T-ROLE-03: Unknown prefixes return HSL from palette
describe('ROLE-03: Unknown prefixes return HSL from palette', () => {
  it('E → hsl(...)', () => {
    expect(roleColor('E', true)).toMatch(/^hsl\(\d+, \d+%, \d+%\)$/);
  });

  it('PM → hsl(...)', () => {
    expect(roleColor('PM', true)).toMatch(/^hsl\(/);
  });

  it('PM → hsl(...)', () => {
    expect(roleColor('PM', false)).toMatch(/^hsl\(/);
  });
});

// T-ROLE-04: Dark vs light adjusts lightness for palette prefixes
describe('ROLE-04: Dark vs light adjusts lightness', () => {
  it('palette prefix has same hue but different lightness', () => {
    const dark = roleColor('E', true);
    const light = roleColor('E', false);
    const darkHue = dark.match(/hsl\((\d+)/)?.[1];
    const lightHue = light.match(/hsl\((\d+)/)?.[1];
    expect(darkHue).toBe(lightHue);

    const darkLit = dark.match(/(\d+)%\)$/)?.[1];
    const lightLit = light.match(/(\d+)%\)$/)?.[1];
    expect(darkLit).not.toBe(lightLit);
    // Dark should be lighter (65%), light theme darker (40%)
    expect(Number(darkLit)).toBeGreaterThan(Number(lightLit));
  });
});

// T-ROLE-05: All 20 palette slots produce distinct hues
describe('ROLE-05: All 20 palette slots produce distinct hues', () => {
  it('each index has a unique hue', () => {
    const hues = new Set<string>();
    for (let i = 0; i < PALETTE_SIZE; i++) {
      const color = roleColorByIndex(i, true);
      const hue = color.match(/hsl\((\d+)/)?.[1];
      expect(hue).toBeDefined();
      hues.add(hue!);
    }
    expect(hues.size).toBe(PALETTE_SIZE);
  });

  it('hues are evenly spaced at 18-degree intervals', () => {
    for (let i = 0; i < PALETTE_SIZE; i++) {
      const color = roleColorByIndex(i, true);
      const hue = parseInt(color.match(/hsl\((\d+)/)?.[1]!, 10);
      expect(hue).toBe(i * 18);
    }
  });
});

// T-ROLE-06: roleCssClass splits known vs palette
describe('ROLE-06: roleCssClass splits known vs palette', () => {
  it('A → role-known-A', () => {
    expect(roleCssClass('A')).toBe('role-known-A');
  });

  it('FS → role-known-FS', () => {
    expect(roleCssClass('FS')).toBe('role-known-FS');
  });

  it('E → role-N (palette)', () => {
    expect(roleCssClass('E')).toBe(`role-${hashPrefix('E')}`);
  });

  it('DU → role-known-DU (known prefix)', () => {
    expect(roleCssClass('DU')).toBe('role-known-DU');
  });
});

// T-ROLE-07: roleDecoClass mirrors roleCssClass
describe('ROLE-07: roleDecoClass mirrors roleCssClass', () => {
  it('A → role-deco-known-A', () => {
    expect(roleDecoClass('A')).toBe('role-deco-known-A');
  });

  it('E → role-deco-N', () => {
    expect(roleDecoClass('E')).toBe(`role-deco-${hashPrefix('E')}`);
  });

  it('TA → role-deco-known-TA', () => {
    expect(roleDecoClass('TA')).toBe('role-deco-known-TA');
  });
});

// T-ROLE-08: generatePaletteCss produces rules for both palette and known
describe('ROLE-08: generatePaletteCss output', () => {
  it('contains all 20 palette deco classes with hsl values', () => {
    const css = generatePaletteCss(true);
    for (let i = 0; i < PALETTE_SIZE; i++) {
      expect(css).toContain(`.role-deco-${i}`);
      expect(css).toContain(`.nap-rendered .role-${i}`);
    }
  });

  it('contains known-prefix overrides with hex colors', () => {
    const css = generatePaletteCss(true);
    expect(css).toContain('.role-deco-known-A');
    expect(css).toContain('#3b82f6');
    expect(css).toContain('.role-deco-known-FS');
    expect(css).toContain('#22c55e');
  });

  it('dark vs light generates different lightness values', () => {
    const dark = generatePaletteCss(true);
    const light = generatePaletteCss(false);
    // Dark uses 65% lightness, light uses 40%
    expect(dark).toContain('65%');
    expect(light).toContain('40%');
  });

  it('known prefix A has different color in dark vs light', () => {
    const dark = generatePaletteCss(true);
    const light = generatePaletteCss(false);
    expect(dark).toContain('#3b82f6');
    expect(light).toContain('#2563eb');
  });
});
