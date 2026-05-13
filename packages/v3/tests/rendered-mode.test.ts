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
import { renderMarkdown } from '../src/renderer/markdown-renderer';

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

// T-0300-RM-04: Role comments render as colored blocks
describe('RM-04: Role comments render as colored blocks', () => {
  it('//A: gets role-architect class', () => {
    const html = renderMarkdown('* //A: architecture thought');
    expect(html).toContain('role-comment');
    expect(html).toContain('role-architect');
  });

  it('//DU: gets role-user class', () => {
    const html = renderMarkdown('* //DU: user note');
    expect(html).toContain('role-user');
  });

  it('//FS: gets role-fs-eng class', () => {
    const html = renderMarkdown('* //FS: code detail');
    expect(html).toContain('role-fs-eng');
  });

  it('//TA: gets role-test-arch class', () => {
    const html = renderMarkdown('* //TA: test design');
    expect(html).toContain('role-test-arch');
  });

  it('//TE: gets role-test-eng class', () => {
    const html = renderMarkdown('* //TE: test note');
    expect(html).toContain('role-test-eng');
  });

  it('role comments inside nested list items are styled', () => {
    const md = '* outer\n  * //A: nested thought';
    const html = renderMarkdown(md);
    expect(html).toContain('role-architect');
  });

  it('generic // comment does NOT get role class', () => {
    const html = renderMarkdown('* // just a comment');
    // Should not have any role-* class
    expect(html).not.toMatch(/role-(architect|user|fs-eng|test-arch|test-eng)/);
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
