import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock monaco-editor (store → themes → monaco)
vi.mock('monaco-editor', () => ({
  default: {},
  editor: {
    defineTheme: vi.fn(),
    setTheme: vi.fn(),
  },
}));

// Provide document + window stubs for persistUiState / applyTheme
vi.stubGlobal('document', {
  documentElement: { style: { setProperty: vi.fn() } },
});
if (typeof window === 'undefined') {
  vi.stubGlobal('window', globalThis);
}

import { useNapStore, loadPersistedUiState, _resetNepicTerminalMemory } from '../src/renderer/store';
import { renderMarkdown, initShiki } from '../src/renderer/markdown-renderer';
import { hashPrefix, roleCssClass, roleColor } from '../src/renderer/role-palette';

// ── Rendered mode — small tests ──

function resetStore() {
  _resetNepicTerminalMemory();
  useNapStore.setState({
    napkins: [],
    architects: [],
    activeNepicId: '',
    activeTerminalId: null,
    activeFilePath: null,
    nepics: [],
    watcherEvents: [],
    rightPaneMode: 'terminal',
    rightFilePath: null,
    rightFileLine: null,
    leftTabs: [],
    activeLeftTabId: null,
    rightTabs: [],
    activeRightTabId: null,
    currentThemeName: 'dark',
    leftPaneRenderMode: 'edit',
  });
}

// T-0300-RM-01: toggleRenderMode store action
describe('RM-01: toggleRenderMode store action', () => {
  beforeEach(resetStore);

  it('initial leftPaneRenderMode is edit', () => {
    expect(useNapStore.getState().leftPaneRenderMode).toBe('edit');
  });

  it('toggle from edit → rendered', () => {
    useNapStore.getState().toggleRenderMode();
    expect(useNapStore.getState().leftPaneRenderMode).toBe('rendered');
  });

  it('toggle from rendered → edit', () => {
    useNapStore.getState().toggleRenderMode(); // → rendered
    useNapStore.getState().toggleRenderMode(); // → edit
    expect(useNapStore.getState().leftPaneRenderMode).toBe('edit');
  });
});

// T-0300-RM-02: Render mode is global — tab switch preserves mode
describe('RM-02: Render mode is global — tab switch preserves mode', () => {
  beforeEach(resetStore);

  it('switching tabs does not reset render mode', () => {
    useNapStore.getState().openDoc('/file-a.md');
    useNapStore.getState().toggleRenderMode();
    expect(useNapStore.getState().leftPaneRenderMode).toBe('rendered');

    // Switch to different file
    useNapStore.getState().openDoc('/file-b.md');
    expect(useNapStore.getState().leftPaneRenderMode).toBe('rendered');
  });

  it('switching back to original tab also preserves mode', () => {
    useNapStore.getState().openDoc('/file-a.md');
    useNapStore.getState().pinTab('left', useNapStore.getState().leftTabs[0].id);
    useNapStore.getState().toggleRenderMode();

    useNapStore.getState().openDoc('/file-b.md');
    useNapStore.getState().openDoc('/file-a.md');
    expect(useNapStore.getState().leftPaneRenderMode).toBe('rendered');
  });
});

// T-0300-RM-03: markdown-it source line mapping
describe('RM-03: markdown-it source line mapping', () => {
  it('heading gets data-source-line attribute (1-indexed)', () => {
    const html = renderMarkdown('# Title\n\nParagraph here.');
    expect(html).toContain('data-source-line="1"');
    // h1 should be on line 1
    expect(html).toMatch(/<h1[^>]*data-source-line="1"/);
  });

  it('paragraph gets data-source-line attribute', () => {
    const html = renderMarkdown('# Title\n\nParagraph here.');
    // Paragraph starts at line 3 (0-indexed line 2, +1 = 3)
    expect(html).toMatch(/<p[^>]*data-source-line="3"/);
  });

  it('list items get data-source-line attributes', () => {
    const html = renderMarkdown('* item one\n* item two\n* item three');
    expect(html).toContain('data-source-line');
    // List or list items should have source lines
    // The <ul> gets the line from token.map, individual <li> tokens may also
    expect(html).toMatch(/data-source-line="1"/);
  });

  // FINDING: <hr> is a self-closing tag (nesting=0) — the source_line plugin
  // only handles nesting===1 (opening tags). <hr> does NOT get data-source-line.
  // This means Cmd+click near an <hr> won't find a source line and will walk up
  // to the nearest block parent. Acceptable limitation — noted for architect.
  it('horizontal rule does NOT get data-source-line (nesting=0, known gap)', () => {
    const html = renderMarkdown('text\n\n---\n\nmore text');
    expect(html).not.toMatch(/<hr[^>]*data-source-line/);
  });

  it('line numbers are 1-indexed (Monaco convention)', () => {
    // First line in markdown → data-source-line="1", not "0"
    const html = renderMarkdown('Hello world');
    expect(html).toContain('data-source-line="1"');
    expect(html).not.toContain('data-source-line="0"');
  });

  it('multi-element document has correct line mapping', () => {
    const md = [
      '# Heading',       // line 1
      '',                 // line 2
      'Paragraph one.',   // line 3
      '',                 // line 4
      '* bullet a',      // line 5
      '* bullet b',      // line 6
    ].join('\n');

    const html = renderMarkdown(md);
    expect(html).toMatch(/<h1[^>]*data-source-line="1"/);
    expect(html).toMatch(/<p[^>]*data-source-line="3"/);
  });
});

// T-0300-RM-04: Role comments render as colored blocks (dynamic palette system)
describe('RM-04: Role comments render as colored blocks', () => {
  it('//A: gets role-known-A class (known prefix)', () => {
    const html = renderMarkdown('* //A: architecture thought');
    expect(html).toContain('role-comment');
    expect(html).toContain('role-known-A');
  });

  it('//DU: gets palette class (not known — hashes to palette)', () => {
    const html = renderMarkdown('* //DU: user note');
    expect(html).toContain('role-comment');
    expect(html).toMatch(/role-\d+/);
  });

  it('//FS: gets role-known-FS class', () => {
    const html = renderMarkdown('* //FS: code detail');
    expect(html).toContain('role-known-FS');
  });

  it('//TA: gets role-known-TA class', () => {
    const html = renderMarkdown('* //TA: test design');
    expect(html).toContain('role-known-TA');
  });

  it('//TE: gets role-known-TE class', () => {
    const html = renderMarkdown('* //TE: test note');
    expect(html).toContain('role-known-TE');
  });

  it('role comments inside nested list items are styled', () => {
    const md = '* outer\n  * //A: nested thought';
    const html = renderMarkdown(md);
    expect(html).toContain('role-known-A');
  });

  it('generic // comment does NOT get role class', () => {
    const html = renderMarkdown('* // just a comment');
    // "// " has a space after //, \w+ won't match
    expect(html).not.toContain('role-comment');
  });
});

// T-0300-RM-07: Rendered mode persistence in ui-state.json
describe('RM-07: Rendered mode persistence in ui-state.json', () => {
  beforeEach(resetStore);

  it('toggleRenderMode calls saveUiState with leftPaneRenderMode', () => {
    const saveSpy = vi.fn();
    (window as any).electronAPI = { saveUiState: saveSpy };

    useNapStore.getState().toggleRenderMode();
    expect(saveSpy).toHaveBeenCalledWith(
      expect.objectContaining({ leftPaneRenderMode: 'rendered' }),
    );

    useNapStore.getState().toggleRenderMode();
    expect(saveSpy).toHaveBeenCalledWith(
      expect.objectContaining({ leftPaneRenderMode: 'edit' }),
    );

    delete (window as any).electronAPI;
  });

  it('loadPersistedUiState restores rendered mode', async () => {
    (window as any).electronAPI = {
      loadUiState: vi.fn().mockResolvedValue({ leftPaneRenderMode: 'rendered' }),
    };

    await loadPersistedUiState();
    expect(useNapStore.getState().leftPaneRenderMode).toBe('rendered');

    delete (window as any).electronAPI;
  });

  it('loadPersistedUiState ignores invalid render mode values', async () => {
    (window as any).electronAPI = {
      loadUiState: vi.fn().mockResolvedValue({ leftPaneRenderMode: 'invalid' }),
    };

    await loadPersistedUiState();
    // Should remain at default
    expect(useNapStore.getState().leftPaneRenderMode).toBe('edit');

    delete (window as any).electronAPI;
  });
});

// ── Shiki code highlighting tests ──

// T-SHIKI-01: Shiki initialization
describe('SHIKI-01: Shiki initialization', () => {
  it('initShiki resolves and enables highlighted rendering', async () => {
    await initShiki();
    const md = '```typescript\nconst x = 1;\n```';
    const html = renderMarkdown(md);
    // After init, fenced TS block should use shiki (class="shiki"), not fallback
    expect(html).toContain('class="shiki');
  });
});

// T-SHIKI-02: Fenced code block with known language renders highlighted
describe('SHIKI-02: Known language renders highlighted', () => {
  it('typescript block produces shiki output with inline styles', async () => {
    await initShiki();
    const md = '```typescript\nconst x: number = 42;\n```';
    const html = renderMarkdown(md);
    expect(html).toContain('class="shiki');
    expect(html).toContain('style="color:');
  });

  it('javascript block also renders highlighted', async () => {
    await initShiki();
    const md = '```javascript\nfunction foo() {}\n```';
    const html = renderMarkdown(md);
    expect(html).toContain('class="shiki');
  });

  it('json block renders highlighted', async () => {
    await initShiki();
    const md = '```json\n{"key": "value"}\n```';
    const html = renderMarkdown(md);
    expect(html).toContain('class="shiki');
  });
});

// T-SHIKI-03: Unknown language falls back to plain rendering
describe('SHIKI-03: Unknown language falls back', () => {
  it('brainfuck falls back to nap-code-block', async () => {
    await initShiki();
    const md = '```brainfuck\n+++.\n```';
    const html = renderMarkdown(md);
    expect(html).toContain('class="nap-code-block"');
    expect(html).not.toContain('class="shiki');
  });
});

// T-SHIKI-04: No language tag falls back
describe('SHIKI-04: No language tag falls back', () => {
  it('bare fenced block falls back to nap-code-block', async () => {
    await initShiki();
    const md = '```\nplain text here\n```';
    const html = renderMarkdown(md);
    expect(html).toContain('class="nap-code-block"');
  });
});

// T-SHIKI-05: data-source-line on fenced code blocks
describe('SHIKI-05: data-source-line on fenced code blocks', () => {
  it('fenced block has correct data-source-line (1-indexed)', async () => {
    await initShiki();
    const md = [
      '# Heading',         // line 1
      '',                   // line 2
      'Paragraph.',         // line 3
      '',                   // line 4
      '```typescript',      // line 5
      'const x = 1;',      // line 6
      '```',                // line 7
    ].join('\n');
    const html = renderMarkdown(md);
    // The fenced block starts at markdown line 4 (0-indexed), so data-source-line="5"
    expect(html).toMatch(/<pre[^>]*data-source-line="5"/);
  });

  it('fallback block also has data-source-line', async () => {
    await initShiki();
    const md = 'text\n\n```\nplain\n```';
    const html = renderMarkdown(md);
    expect(html).toMatch(/<pre[^>]*data-source-line/);
  });
});

// T-SHIKI-06: Theme switching changes code block colors
describe('SHIKI-06: Theme switching changes code block colors', () => {
  it('vitesse-dark and vitesse-light produce different output', async () => {
    await initShiki();
    const md = '```typescript\nconst x: number = 42;\n```';
    const darkHtml = renderMarkdown(md, 'vitesse-dark');
    const lightHtml = renderMarkdown(md, 'vitesse-light');
    // Both should be shiki output
    expect(darkHtml).toContain('class="shiki');
    expect(lightHtml).toContain('class="shiki');
    // Colors should differ between themes
    expect(darkHtml).not.toBe(lightHtml);
  });
});

// ── Dynamic role palette — rendered mode integration ──

// T-ROLE-09: Known prefix gets known class in rendered output
describe('ROLE-09: Known prefix gets known class in rendered output', () => {
  it('//A: produces role-known-A class', () => {
    const html = renderMarkdown('* //A: thought');
    expect(html).toContain('role-known-A');
  });

  it('//FS: produces role-known-FS class', () => {
    const html = renderMarkdown('* //FS: detail');
    expect(html).toContain('role-known-FS');
  });
});

// T-ROLE-10: Unknown prefix gets palette class in rendered output
describe('ROLE-10: Unknown prefix gets palette class in rendered output', () => {
  it('//E: gets role-N class (hashed)', () => {
    const html = renderMarkdown('* //E: expert thought');
    const expected = `role-${hashPrefix('E')}`;
    expect(html).toContain(expected);
  });

  it('//DU: gets palette class (not known)', () => {
    const html = renderMarkdown('* //DU: user note');
    const expected = `role-${hashPrefix('DU')}`;
    expect(html).toContain(expected);
  });

  it('//PM: gets palette class', () => {
    const html = renderMarkdown('* //PM: product thought');
    const expected = `role-${hashPrefix('PM')}`;
    expect(html).toContain(expected);
  });
});

// T-ROLE-12: Theme switch updates palette colors, known stay pinned
describe('ROLE-12: Dark vs light changes colors', () => {
  it('known prefix A has different dark vs light hex', () => {
    const dark = roleColor('A', true);
    const light = roleColor('A', false);
    expect(dark).toBe('#3b82f6');
    expect(light).toBe('#2563eb');
    expect(dark).not.toBe(light);
  });

  it('palette prefix E has same hue, different lightness', () => {
    const dark = roleColor('E', true);
    const light = roleColor('E', false);
    expect(dark).toMatch(/^hsl\(/);
    expect(light).toMatch(/^hsl\(/);
    // Same hue, different lightness
    const darkHue = dark.match(/hsl\((\d+)/)?.[1];
    const lightHue = light.match(/hsl\((\d+)/)?.[1];
    expect(darkHue).toBe(lightHue);
    expect(dark).not.toBe(light);
  });
});
