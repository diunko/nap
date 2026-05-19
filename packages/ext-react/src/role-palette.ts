/**
 * Role comment palette — hash any //XX: prefix to a consistent color.
 * Ported from v3/src/renderer/role-palette.ts.
 *
 * 20 evenly-spaced hues. Same prefix always gets the same hue.
 * Known prefixes (A, DU, FS, TA, TE) get fixed colors matching role identity.
 */

const PALETTE_SIZE = 20;
const HUE_STEP = 360 / PALETTE_SIZE; // 18 degrees

const KNOWN: Record<string, { dark: string; light: string }> = {
  A:  { dark: '#3b82f6', light: '#2563eb' },   // architect — blue
  DU: { dark: '#22c55e', light: '#16a34a' },   // user — bright green
  FS: { dark: '#22c55e', light: '#16a34a' },   // fs-eng — green
  TA: { dark: '#f59e0b', light: '#d97706' },   // test-arch — orange
  TE: { dark: '#6b7280', light: '#6b7280' },   // test-eng — gray
};

/** Deterministic hash of a prefix string → palette index (0–19). */
export function hashPrefix(prefix: string): number {
  let h = 5381;
  for (let i = 0; i < prefix.length; i++) {
    h = ((h << 5) + h + prefix.charCodeAt(i)) | 0;
  }
  return ((h % PALETTE_SIZE) + PALETTE_SIZE) % PALETTE_SIZE;
}

/** HSL color for a palette index. */
export function roleColorByIndex(index: number, isDark: boolean): string {
  const hue = index * HUE_STEP;
  const sat = 55;
  const lit = isDark ? 65 : 40;
  return `hsl(${hue}, ${sat}%, ${lit}%)`;
}

/** Color for a prefix string — known prefixes return their fixed color, others hash. */
export function roleColor(prefix: string, isDark: boolean): string {
  const known = KNOWN[prefix];
  if (known) return isDark ? known.dark : known.light;
  return roleColorByIndex(hashPrefix(prefix), isDark);
}

/** CSS class for edit-mode decorations. */
export function roleDecoClass(prefix: string): string {
  if (KNOWN[prefix]) return `role-deco-known-${prefix}`;
  return `role-deco-${hashPrefix(prefix)}`;
}

/** Generate all palette + known-prefix CSS rules. */
export function generatePaletteCss(isDark: boolean): string {
  const rules: string[] = [];

  for (let i = 0; i < PALETTE_SIZE; i++) {
    const color = roleColorByIndex(i, isDark);
    rules.push(`.role-deco-${i} { color: ${color} !important; }`);
  }

  for (const [prefix, colors] of Object.entries(KNOWN)) {
    const color = isDark ? colors.dark : colors.light;
    rules.push(`.role-deco-known-${prefix} { color: ${color} !important; }`);
  }

  return rules.join('\n');
}

export { PALETTE_SIZE };
