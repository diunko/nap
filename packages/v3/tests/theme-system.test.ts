import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock monaco-editor (themes.ts imports it at top level)
vi.mock('monaco-editor', () => ({
  default: {},
  editor: {
    defineTheme: vi.fn(),
    setTheme: vi.fn(),
  },
}));

// Provide document + window stubs for tests that call applyTheme/persistUiState
const mockSetProperty = vi.fn();
vi.stubGlobal('document', {
  documentElement: { style: { setProperty: mockSetProperty } },
});
if (typeof window === 'undefined') {
  vi.stubGlobal('window', globalThis);
}

import { THEMES, findTheme } from '../src/renderer/themes';
import type { ThemeDef } from '../src/renderer/themes';
import { useNapStore, loadPersistedUiState, _resetNepicTerminalMemory } from '../src/renderer/store';

// ── Theme system — small tests ──

const REQUIRED_SHELL_KEYS = ['bg', 'bgSecondary', 'border', 'text', 'textMuted', 'accent'];
const REQUIRED_ROLE_KEYS = ['architect', 'user', 'fs-eng', 'test-arch', 'test-eng'];

function resetStore() {
  _resetNepicTerminalMemory();
  mockSetProperty.mockClear();
  useNapStore.setState({
    currentThemeName: THEMES[0].name,
    leftPaneRenderMode: 'edit',
  });
}

// T-0300-TH-01: THEMES array structure validation
describe('TH-01: THEMES array structure validation', () => {
  it('has at least 5 themes (1 dark + 4 light)', () => {
    expect(THEMES.length).toBeGreaterThanOrEqual(5);
  });

  it('all theme names are unique', () => {
    const names = THEMES.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('every theme has a non-empty name', () => {
    for (const theme of THEMES) {
      expect(typeof theme.name).toBe('string');
      expect(theme.name.length).toBeGreaterThan(0);
    }
  });

  it('every theme has valid monacoTheme structure', () => {
    for (const theme of THEMES) {
      expect(theme.monacoTheme).toBeDefined();
      expect(['vs', 'vs-dark', 'hc-black', 'hc-light']).toContain(theme.monacoTheme.base);
      expect(typeof theme.monacoTheme.inherit).toBe('boolean');
      expect(Array.isArray(theme.monacoTheme.rules)).toBe(true);
      expect(theme.monacoTheme.colors).toBeDefined();
    }
  });

  it('every theme has all required shell properties', () => {
    for (const theme of THEMES) {
      expect(theme.shell).toBeDefined();
      for (const key of REQUIRED_SHELL_KEYS) {
        expect(theme.shell).toHaveProperty(key);
        expect(typeof (theme.shell as Record<string, string>)[key]).toBe('string');
      }
    }
  });

  it('every theme has all required role colors', () => {
    for (const theme of THEMES) {
      expect(theme.roleColors).toBeDefined();
      for (const key of REQUIRED_ROLE_KEYS) {
        expect(theme.roleColors).toHaveProperty(key);
        expect(typeof (theme.roleColors as Record<string, string>)[key]).toBe('string');
      }
    }
  });
});

// T-0300-TH-02: cycleTheme rotates through THEMES array
describe('TH-02: cycleTheme rotates through THEMES array', () => {
  beforeEach(resetStore);

  it('starts at THEMES[0]', () => {
    expect(useNapStore.getState().currentThemeName).toBe(THEMES[0].name);
  });

  it('cycles through all themes in order', () => {
    for (let i = 0; i < THEMES.length; i++) {
      expect(useNapStore.getState().currentThemeName).toBe(THEMES[i].name);
      useNapStore.getState().cycleTheme();
    }
  });

  it('wraps back to THEMES[0] after full rotation', () => {
    for (let i = 0; i < THEMES.length; i++) {
      useNapStore.getState().cycleTheme();
    }
    expect(useNapStore.getState().currentThemeName).toBe(THEMES[0].name);
  });
});

// T-0300-TH-03: Theme persistence — save and restore
describe('TH-03: Theme persistence — save and restore', () => {
  beforeEach(resetStore);

  it('cycleTheme calls saveUiState with theme name', () => {
    const saveSpy = vi.fn();
    (window as any).electronAPI = { saveUiState: saveSpy };

    useNapStore.getState().cycleTheme();
    expect(saveSpy).toHaveBeenCalledWith(
      expect.objectContaining({ theme: THEMES[1].name }),
    );

    delete (window as any).electronAPI;
  });

  it('loadPersistedUiState restores saved theme', async () => {
    const savedTheme = THEMES[2].name;
    (window as any).electronAPI = {
      loadUiState: vi.fn().mockResolvedValue({ theme: savedTheme }),
    };

    await loadPersistedUiState();
    expect(useNapStore.getState().currentThemeName).toBe(savedTheme);

    delete (window as any).electronAPI;
  });
});

// T-0300-TH-04: Theme fallback — saved theme not in THEMES array
describe('TH-04: Theme fallback — saved theme not in THEMES array', () => {
  beforeEach(resetStore);

  it('falls back to THEMES[0] when saved theme name is unknown', async () => {
    (window as any).electronAPI = {
      loadUiState: vi.fn().mockResolvedValue({ theme: 'nonexistent-theme' }),
    };

    await loadPersistedUiState();
    expect(useNapStore.getState().currentThemeName).toBe(THEMES[0].name);

    delete (window as any).electronAPI;
  });

  it('findTheme returns THEMES[0] for unknown name', () => {
    const result = findTheme('light-pink');
    expect(result.name).toBe(THEMES[0].name);
  });
});

// T-0300-TK-01: Generic // comment color matches //DU: color
describe('TK-01: Generic // comment color matches //DU: color', () => {
  it('every theme has comment foreground === comment.user foreground', () => {
    for (const theme of THEMES) {
      const rules = theme.monacoTheme.rules;
      const commentRule = rules.find((r) => r.token === 'comment');
      const commentUserRule = rules.find((r) => r.token === 'comment.user');

      expect(commentRule).toBeDefined();
      expect(commentUserRule).toBeDefined();
      expect(commentRule!.foreground).toBe(commentUserRule!.foreground);
    }
  });
});
