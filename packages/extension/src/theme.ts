/**
 * Theme — lightBlue only, no dark mode.
 * Copied from v3/src/renderer/themes.ts, stripped to single theme, no role-palette dependency.
 */
import * as monaco from 'monaco-editor';

export interface ThemeDef {
  name: string;
  isDark: boolean;
  monacoTheme: monaco.editor.IStandaloneThemeData;
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

export const lightBlue: ThemeDef = {
  name: 'light-blue',
  isDark: false,
  monacoTheme: {
    base: 'vs',
    inherit: true,
    rules: tokenRules({
      heading: '1a1a2e',
      bulletMarker: '7a8a9a',
      boldMarker: '7a8a9a',
      inlineCode: 'a0522d',
      inlineCodeBg: 'e0e8f0',
      comment: '16a34a',
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

function camelToKebab(s: string): string {
  return s.replace(/([A-Z])/g, '-$1').toLowerCase();
}

/** Convert shell theme values to CSS variable entries. Pure function for testing. */
export function shellToCssVars(shell: ThemeDef['shell']): Array<[string, string]> {
  return Object.entries(shell).map(([key, value]) => [`--nap-${camelToKebab(key)}`, value]);
}

let themeRegistered = false;

export function registerTheme(): void {
  if (themeRegistered) return;
  themeRegistered = true;
  console.log('[theme] registering light-blue Monaco theme');
  monaco.editor.defineTheme(lightBlue.name, lightBlue.monacoTheme);
}

export function applyTheme(): void {
  console.log('[theme] applying light-blue');
  monaco.editor.setTheme(lightBlue.name);

  const root = document.documentElement;
  for (const [varName, value] of shellToCssVars(lightBlue.shell)) {
    root.style.setProperty(varName, value);
  }
}
