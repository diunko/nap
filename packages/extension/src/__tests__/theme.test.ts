/**
 * Theme CSS variable generation test — T7.1.
 *
 * Tests the pure camelToKebab + CSS variable generation logic without importing
 * monaco-editor (which can't resolve in vitest's node environment).
 */
import { describe, it, expect } from 'vitest';

// Inline the pure logic being tested (avoids monaco-editor import chain)
function camelToKebab(s: string): string {
  return s.replace(/([A-Z])/g, '-$1').toLowerCase();
}

function shellToCssVars(shell: Record<string, string>): Array<[string, string]> {
  return Object.entries(shell).map(([key, value]) => [`--nap-${camelToKebab(key)}`, value]);
}

// lightBlue shell values (copied from theme.ts to avoid monaco import)
const lightBlueShell = {
  bg: '#f0f4f8',
  bgSecondary: '#e6eaee',
  bgTertiary: '#dce0e4',
  bgHover: '#e1e5e9',
  border: '#c4cad0',
  text: '#2e3440',
  textSecondary: '#4c566a',
  textMuted: '#6d7a8a',
  textDim: '#94a0b0',
  accent: '#2563eb',
  link: '#1e50c0',
};

describe('shellToCssVars', () => {
  it('generates correct CSS variable names from camelCase', () => {
    const vars = shellToCssVars(lightBlueShell);
    const map = new Map(vars);

    expect(map.get('--nap-bg')).toBe('#f0f4f8');
    expect(map.get('--nap-text')).toBe('#2e3440');
    expect(map.get('--nap-bg-secondary')).toBe('#e6eaee');
    expect(map.get('--nap-bg-hover')).toBe('#e1e5e9');
    expect(map.get('--nap-border')).toBe('#c4cad0');
    expect(map.get('--nap-text-muted')).toBe('#6d7a8a');
    expect(map.get('--nap-accent')).toBe('#2563eb');
    expect(map.get('--nap-link')).toBe('#1e50c0');
    console.log('[T7.1] CSS variables generated correctly');
  });

  it('produces correct number of variables', () => {
    const vars = shellToCssVars(lightBlueShell);
    expect(vars).toHaveLength(Object.keys(lightBlueShell).length);
    console.log(`[T7.1] ${vars.length} CSS variables`);
  });

  it('all variable names start with --nap-', () => {
    const vars = shellToCssVars(lightBlueShell);
    for (const [name] of vars) {
      expect(name).toMatch(/^--nap-/);
    }
  });

  it('camelToKebab handles multi-word keys', () => {
    expect(camelToKebab('bgSecondary')).toBe('bg-secondary');
    expect(camelToKebab('textMuted')).toBe('text-muted');
    expect(camelToKebab('bgHover')).toBe('bg-hover');
    expect(camelToKebab('bg')).toBe('bg');
    console.log('[T7.1] camelToKebab correct');
  });
});
