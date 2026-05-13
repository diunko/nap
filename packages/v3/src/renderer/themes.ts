// ── Theme system — all theme definitions, application, and registration ──
//
// Each ThemeDef: Monaco theme + app shell CSS variables + role color map.
// THEMES array is the rotation list — comment out entries to remove from rotation.

import * as monaco from 'monaco-editor';
import { generatePaletteCss } from './role-palette';

export interface ThemeDef {
  name: string;
  isDark: boolean;
  monacoTheme: monaco.editor.IStandaloneThemeData;
  shikiTheme: string;
  shell: {
    bg: string;
    bgSecondary: string;
    bgTertiary: string;
    bgHover: string;
    border: string;
    text: string;
    textSecondary: string;
    textMuted: string;
    textDim: string;
    accent: string;
    link: string;
  };
}

// ── Shared token rules ──
// comment.role gets a neutral base color — actual per-prefix colors come from decorations.
// Generic // comments (no role prefix) use the same base color.

function tokenRules(opts: {
  heading: string;
  bulletMarker: string;
  boldMarker: string;
  inlineCode: string;
  inlineCodeBg: string;
  comment: string;
  source: string;
}): monaco.editor.ITokenThemeRule[] {
  return [
    { token: 'heading', foreground: opts.heading, fontStyle: 'bold' },
    { token: 'bullet.marker', foreground: opts.bulletMarker },
    { token: 'bold', fontStyle: 'bold' },
    { token: 'bold.marker', foreground: opts.boldMarker },
    { token: 'inline-code', foreground: opts.inlineCode, background: opts.inlineCodeBg },
    { token: 'comment', foreground: opts.comment },
    { token: 'comment.role', foreground: opts.comment },
    { token: 'source', foreground: opts.source },
  ];
}

// ── Dark theme (current appearance, exact hex match) ──

const dark: ThemeDef = {
  name: 'dark',
  isDark: true,
  shikiTheme: 'vitesse-dark',
  monacoTheme: {
    base: 'vs-dark',
    inherit: true,
    rules: tokenRules({
      heading: 'e5e5e5',
      bulletMarker: '6b7280',
      boldMarker: '6b7280',
      inlineCode: 'ce9178',
      inlineCodeBg: '2d2d2d',
      comment: '6b9955',
      source: 'd4d4d4',
    }),
    colors: { 'editor.background': '#1e1e1e' },
  },
  shell: {
    bg: '#1e1e1e',
    bgSecondary: '#252526',
    bgTertiary: '#37373d',
    bgHover: '#2a2d2e',
    border: '#3c3c3c',
    text: '#e5e5e5',
    textSecondary: '#cccccc',
    textMuted: '#6b7280',
    textDim: '#525252',
    accent: '#007acc',
    link: '#9cdcfe',
  },
};

// ── Light-cream (warm, paper-like) ──

const lightCream: ThemeDef = {
  name: 'light-cream',
  isDark: false,
  shikiTheme: 'vitesse-light',
  monacoTheme: {
    base: 'vs',
    inherit: true,
    rules: tokenRules({
      heading: '1a1a1a',
      bulletMarker: '8a7e6a',
      boldMarker: '8a7e6a',
      inlineCode: 'a0522d',
      inlineCodeBg: 'f0e8d8',
      comment: '5a7a4a',
      source: '3c3836',
    }),
    colors: { 'editor.background': '#fdf6e3' },
  },
  shell: {
    bg: '#fdf6e3',
    bgSecondary: '#f5eedb',
    bgTertiary: '#ece5d0',
    bgHover: '#f0e9d6',
    border: '#d4c9a8',
    text: '#3c3836',
    textSecondary: '#504945',
    textMuted: '#7c7065',
    textDim: '#a09080',
    accent: '#268bd2',
    link: '#2573a7',
  },
};

// ── Light-gray (cool, neutral) ──

const lightGray: ThemeDef = {
  name: 'light-gray',
  isDark: false,
  shikiTheme: 'vitesse-light',
  monacoTheme: {
    base: 'vs',
    inherit: true,
    rules: tokenRules({
      heading: '1a1a1a',
      bulletMarker: '888888',
      boldMarker: '888888',
      inlineCode: 'a0522d',
      inlineCodeBg: 'e8e8e8',
      comment: '5a7a4a',
      source: '333333',
    }),
    colors: { 'editor.background': '#f5f5f5' },
  },
  shell: {
    bg: '#f5f5f5',
    bgSecondary: '#ebebeb',
    bgTertiary: '#e0e0e0',
    bgHover: '#e8e8e8',
    border: '#cccccc',
    text: '#333333',
    textSecondary: '#505050',
    textMuted: '#757575',
    textDim: '#999999',
    accent: '#0078d4',
    link: '#0366d6',
  },
};

// ── Light-sepia (e-reader feel) ──

const lightSepia: ThemeDef = {
  name: 'light-sepia',
  isDark: false,
  shikiTheme: 'vitesse-light',
  monacoTheme: {
    base: 'vs',
    inherit: true,
    rules: tokenRules({
      heading: '2a2015',
      bulletMarker: '8a7e6a',
      boldMarker: '8a7e6a',
      inlineCode: '8b4513',
      inlineCodeBg: 'ede3d0',
      comment: '5a7a4a',
      source: '3d3425',
    }),
    colors: { 'editor.background': '#faf0dc' },
  },
  shell: {
    bg: '#faf0dc',
    bgSecondary: '#f0e6d0',
    bgTertiary: '#e6dcc5',
    bgHover: '#ede3d3',
    border: '#d0c4a8',
    text: '#3d3425',
    textSecondary: '#544a3a',
    textMuted: '#7a6f5f',
    textDim: '#9e9484',
    accent: '#b07020',
    link: '#8a5a2b',
  },
};

// ── Light-blue (cool, slight blue tint) ──

const lightBlue: ThemeDef = {
  name: 'light-blue',
  isDark: false,
  shikiTheme: 'vitesse-light',
  monacoTheme: {
    base: 'vs',
    inherit: true,
    rules: tokenRules({
      heading: '1a1a2e',
      bulletMarker: '7a8a9a',
      boldMarker: '7a8a9a',
      inlineCode: 'a0522d',
      inlineCodeBg: 'e0e8f0',
      comment: '5a7a4a',
      source: '2e3440',
    }),
    colors: { 'editor.background': '#f0f4f8' },
  },
  shell: {
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
  },
};

// ── Exported THEMES array — rotation list ──

export const THEMES: ThemeDef[] = [
  dark,
  lightCream,
  lightGray,
  lightSepia,
  lightBlue,
];

// ── Registration and application ──

let themesRegistered = false;

/** Register all Monaco themes. Call once at startup before editor creation. */
export function registerThemes(): void {
  if (themesRegistered) return;
  themesRegistered = true;
  for (const theme of THEMES) {
    monaco.editor.defineTheme(theme.name, theme.monacoTheme);
  }
}

function camelToKebab(s: string): string {
  return s.replace(/([A-Z])/g, '-$1').toLowerCase();
}

let paletteStyleEl: HTMLStyleElement | null = null;

/** Apply a theme: set Monaco theme + CSS variables on :root + palette CSS. */
export function applyTheme(theme: ThemeDef): void {
  monaco.editor.setTheme(theme.name);

  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme.shell)) {
    root.style.setProperty(`--nap-${camelToKebab(key)}`, value);
  }

  // Inject/update role palette CSS (20 hues × dark/light)
  if (!paletteStyleEl) {
    paletteStyleEl = document.createElement('style');
    paletteStyleEl.id = 'nap-role-palette';
    document.head.appendChild(paletteStyleEl);
  }
  paletteStyleEl.textContent = generatePaletteCss(theme.isDark);
}

/** Find a theme by name, fallback to THEMES[0]. */
export function findTheme(name: string): ThemeDef {
  return THEMES.find((t) => t.name === name) ?? THEMES[0];
}
