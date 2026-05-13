// ── Role comment palette — hash any //XX: prefix to a consistent color ──
//
// 20 evenly-spaced hues. Same prefix always gets the same hue.
// Lightness adjusted for dark vs light themes.

const PALETTE_SIZE = 20;
const HUE_STEP = 360 / PALETTE_SIZE; // 18 degrees

// ── Known prefixes with fixed colors (keep existing role identity) ──
// DU intentionally omitted — user's own prefix uses the palette like any new prefix.

const KNOWN: Record<string, { dark: string; light: string }> = {
  A:  { dark: '#3b82f6', light: '#2563eb' },   // architect — blue
  FS: { dark: '#22c55e', light: '#16a34a' },   // fs-eng — green
  TA: { dark: '#f59e0b', light: '#d97706' },   // test-arch — orange
  TE: { dark: '#6b7280', light: '#6b7280' },   // test-eng — gray
};

/** Deterministic hash of a prefix string → palette index (0–19). */
export function hashPrefix(prefix: string): number {
  // djb2 hash
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

/** CSS class for rendered mode — known prefixes get `role-known-XX`, others `role-N`. */
export function roleCssClass(prefix: string): string {
  if (KNOWN[prefix]) return `role-known-${prefix}`;
  return `role-${hashPrefix(prefix)}`;
}

/** CSS class for edit-mode decorations — mirrors roleCssClass with `deco-` prefix. */
export function roleDecoClass(prefix: string): string {
  if (KNOWN[prefix]) return `role-deco-known-${prefix}`;
  return `role-deco-${hashPrefix(prefix)}`;
}

/** Generate all palette + known-prefix CSS rules. */
export function generatePaletteCss(isDark: boolean): string {
  const rules: string[] = [];

  // 20 palette hues
  for (let i = 0; i < PALETTE_SIZE; i++) {
    const color = roleColorByIndex(i, isDark);
    rules.push(`.nap-rendered .role-${i} { color: ${color}; }`);
    rules.push(`.role-deco-${i} { color: ${color} !important; }`);
  }

  // Known-prefix overrides
  for (const [prefix, colors] of Object.entries(KNOWN)) {
    const color = isDark ? colors.dark : colors.light;
    rules.push(`.nap-rendered .role-known-${prefix} { color: ${color}; }`);
    rules.push(`.role-deco-known-${prefix} { color: ${color} !important; }`);
  }

  return rules.join('\n');
}

export { PALETTE_SIZE };
