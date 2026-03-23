import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { useTerminalStore, type NapkinEntry } from '../src/renderer/store';
import { disposeTerminal } from '../src/renderer/terminal-registry';
import { NapkinBrowser } from '../src/renderer/components/NapkinBrowser';
import { KanbanOverlay } from '../src/renderer/components/KanbanOverlay';

// Reset store between tests
beforeEach(() => {
  const state = useTerminalStore.getState();
  for (const t of state.terminals) {
    disposeTerminal(t.id);
  }
  useTerminalStore.setState({
    terminals: [],
    activeTerminalId: null,
    sidebarVisible: true,
    focusedCardSlug: null,
    cardViewMode: 'collapsed',
    activeNepicId: 'spaces',
    browserFilterText: '',
    browserFilterVisible: false,
    napkins: [],
    kanbanVisible: false,
  });
});

// ---------------------------------------------------------------------------
// T-1200-07: store merges NapkinSnapshot preserving status
// ---------------------------------------------------------------------------
describe('T-1200-07: store merges NapkinSnapshot preserving status', () => {
  test('status arriving before filesystem data creates placeholder, filesystem merges correctly', () => {
    const store = useTerminalStore.getState();

    // Step 1: status arrives first
    store.mergeNapkinStatus('0100-alpha', 'doing');

    const afterStatus = useTerminalStore.getState();
    const placeholder = afterStatus.napkins.find((n) => n.slug === '0100-alpha');
    expect(placeholder).toBeDefined();
    expect(placeholder!.status).toBe('doing');
    expect(placeholder!.entries).toEqual([]);
    expect(placeholder!.napkinBullets).toEqual([]);

    // Step 2: filesystem NapkinSnapshot arrives
    store.setNapkinData({
      slug: '0100-alpha',
      absPath: '/tmp/napkins/0100-alpha',
      entries: [
        { name: '0100-alpha.nap.md', absPath: '/tmp/napkins/0100-alpha/0100-alpha.nap.md', type: 'file' },
        { name: '0100-alpha.spec.md', absPath: '/tmp/napkins/0100-alpha/0100-alpha.spec.md', type: 'file' },
        { name: '001-fs-eng', absPath: '/tmp/napkins/0100-alpha/agents/001-fs-eng', type: 'agent', files: [
          { name: 'prompt.md', absPath: '/tmp/napkins/0100-alpha/agents/001-fs-eng/prompt.md', type: 'file' },
        ] },
      ],
      napkinBullets: ['connect real data'],
    });

    const afterFs = useTerminalStore.getState();
    const merged = afterFs.napkins.find((n) => n.slug === '0100-alpha');
    expect(merged).toBeDefined();
    expect(merged!.status).toBe('doing'); // preserved from status IPC
    expect(merged!.entries).toHaveLength(3);
    expect(merged!.napkinBullets).toEqual(['connect real data']);
    expect(merged!.absPath).toBe('/tmp/napkins/0100-alpha');
  });
});

// ---------------------------------------------------------------------------
// T-1200-08: store enriches agent entries with terminalId from sessions
// ---------------------------------------------------------------------------
describe('T-1200-08: store enriches agent entries with terminalId from sessions', () => {
  test('deriveNapkinCards matches agents to terminals by index', () => {
    // We test the derivation by importing NapkinBrowser and checking rendered output.
    // But since deriveNapkinCards is internal to NapkinBrowser, we test via store + render.

    // Set up napkin with 2 agent entries
    useTerminalStore.setState({
      napkins: [
        {
          slug: '0100-alpha',
          absPath: '/tmp/0100-alpha',
          entries: [
            { name: '0100-alpha.nap.md', absPath: '/tmp/0100-alpha/0100-alpha.nap.md', type: 'file' },
            { name: '001-test-arch', absPath: '/tmp/0100-alpha/agents/001-test-arch', type: 'agent', files: [] },
            { name: '002-fs-eng', absPath: '/tmp/0100-alpha/agents/002-fs-eng', type: 'agent', files: [] },
          ],
          napkinBullets: [],
          status: 'doing',
        },
      ],
      // Two terminals matching this napkin, sorted by createdAt
      terminals: [
        { id: 'term-1', name: 'test-arch', status: 'running', createdAt: 1, napkinSlug: '0100-alpha', role: 'agent' } as any,
        { id: 'term-2', name: 'fs-eng', status: 'done', createdAt: 2, napkinSlug: '0100-alpha', role: 'agent' } as any,
      ],
      focusedCardSlug: '0100-alpha',
      cardViewMode: 'extended',
    });

    // Render NapkinBrowser
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(React.createElement(NapkinBrowser));
    });

    // Find agent rows — they have data-testid="browser-agent"
    const agentRows = container.querySelectorAll('[data-testid="browser-agent"]');
    expect(agentRows.length).toBe(2);

    // First agent should have status dot (running = green, pulsing)
    const dot1 = agentRows[0].querySelector('span[data-status="run"]');
    expect(dot1).not.toBeNull();

    // Second agent should have status dot (done = blue)
    const dot2 = agentRows[1].querySelector('span[data-status="done"]');
    expect(dot2).not.toBeNull();

    // Check [terminal] entries — both agents have live sessions
    const allText = container.textContent ?? '';
    expect(allText.match(/\[terminal\]/g)?.length).toBe(2);

    act(() => { root.unmount(); });
    container.remove();
  });
});

// ---------------------------------------------------------------------------
// T-1200-09: [terminal] virtual entry only when agent has live session
// ---------------------------------------------------------------------------
describe('T-1200-09: [terminal] virtual entry only when agent has live session', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  test('agent A with terminalId shows [terminal], agent B without does not', () => {
    useTerminalStore.setState({
      napkins: [
        {
          slug: '0100-mixed',
          absPath: '/tmp/0100-mixed',
          entries: [
            { name: '001-agent-a', absPath: '/tmp/0100-mixed/agents/001-agent-a', type: 'agent', files: [
              { name: 'prompt.md', absPath: '/tmp/0100-mixed/agents/001-agent-a/prompt.md', type: 'file' },
            ] },
            { name: '002-agent-b', absPath: '/tmp/0100-mixed/agents/002-agent-b', type: 'agent', files: [
              { name: 'prompt.md', absPath: '/tmp/0100-mixed/agents/002-agent-b/prompt.md', type: 'file' },
            ] },
          ],
          napkinBullets: [],
          status: 'doing',
        },
      ],
      // Only one terminal for this napkin — matches first agent by index
      terminals: [
        { id: 'term-a', name: 'agent-a', status: 'running', createdAt: 1, napkinSlug: '0100-mixed', role: 'agent' } as any,
      ],
      focusedCardSlug: '0100-mixed',
      cardViewMode: 'extended',
    });

    act(() => {
      root.render(React.createElement(NapkinBrowser));
    });

    // Count [terminal] text nodes
    const allText = container.textContent ?? '';
    const terminalMatches = allText.match(/\[terminal\]/g);
    expect(terminalMatches?.length ?? 0).toBe(1);

    // Verify agent A has [terminal] and agent B doesn't
    const agentRows = container.querySelectorAll('[data-testid="browser-agent"]');
    expect(agentRows.length).toBe(2);

    // Agent A's parent should contain [terminal]
    const agentAParent = agentRows[0].parentElement;
    expect(agentAParent?.textContent).toContain('[terminal]');

    // Agent B's parent should NOT contain [terminal]
    const agentBParent = agentRows[1].parentElement;
    expect(agentBParent?.textContent).not.toContain('[terminal]');
  });
});

// ---------------------------------------------------------------------------
// T-1200-13: kanban still works with new type shape
// ---------------------------------------------------------------------------
describe('T-1200-13: kanban still works with new NapkinSnapshot type shape', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  test('kanban cards display correctly with entries[] instead of artifacts[]', () => {
    useTerminalStore.setState({
      kanbanVisible: true,
      napkins: [
        {
          slug: '0100-kanban-test',
          absPath: '/tmp/0100-kanban-test',
          entries: [
            { name: '0100-kanban-test.nap.md', absPath: '/tmp/0100-kanban-test/0100-kanban-test.nap.md', type: 'file' },
            { name: '0100-kanban-test.spec.md', absPath: '/tmp/0100-kanban-test/0100-kanban-test.spec.md', type: 'file' },
            { name: 'notes.txt', absPath: '/tmp/0100-kanban-test/notes.txt', type: 'file' },
            { name: '001-arch', absPath: '/tmp/0100-kanban-test/agents/001-arch', type: 'agent', files: [] },
            { name: '002-eng', absPath: '/tmp/0100-kanban-test/agents/002-eng', type: 'agent', files: [] },
          ],
          napkinBullets: ['kanban bullet'],
          status: 'doing',
        },
      ],
      terminals: [
        { id: 't1', name: 'arch', status: 'running', createdAt: 1, napkinSlug: '0100-kanban-test' } as any,
        { id: 't2', name: 'eng', status: 'done', createdAt: 2, napkinSlug: '0100-kanban-test' } as any,
      ],
    });

    act(() => {
      root.render(React.createElement(KanbanOverlay));
    });

    // Card should be in doing column
    const doingCol = container.querySelector('[data-testid="kanban-col-doing"]');
    expect(doingCol).not.toBeNull();
    expect(doingCol!.textContent).toContain('(1)');
    expect(doingCol!.textContent).toContain('0100-kanban-test');

    // Expand card to see badges
    const slugSpans = doingCol!.querySelectorAll('span');
    for (const span of slugSpans) {
      if (span.textContent?.trim() === '0100-kanban-test') {
        act(() => { span.click(); });
        break;
      }
    }

    // Badge derivation: nap and spec should be filled, test and journeys dimmed
    const allSpans = container.querySelectorAll('span');
    const badges: { text: string; color: string }[] = [];
    for (const span of allSpans) {
      const text = span.textContent?.trim() ?? '';
      if (['nap', 'spec', 'test', 'journeys'].includes(text)) {
        badges.push({ text, color: span.style.color });
      }
    }
    expect(badges.length).toBe(4);

    const napBadge = badges.find((b) => b.text === 'nap');
    expect(napBadge!.color).toContain('156'); // #9cdcfe filled

    const specBadge = badges.find((b) => b.text === 'spec');
    expect(specBadge!.color).toContain('156');

    const testBadge = badges.find((b) => b.text === 'test');
    expect(testBadge!.color).toContain('107'); // #6b7280 dimmed

    // Agent dots should be present
    const dots = Array.from(doingCol!.querySelectorAll('span')).filter(
      (s) => s.style.borderRadius === '50%',
    );
    expect(dots.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// T-1200-17: napkinsBasePath plumbing removed
// ---------------------------------------------------------------------------
describe('T-1200-17: napkinsBasePath plumbing removed', () => {
  test('store state does not have napkinsBasePath', () => {
    const state = useTerminalStore.getState();
    expect(state).not.toHaveProperty('napkinsBasePath');
  });

  test('store does not have setNapkinsBasePath action', () => {
    const state = useTerminalStore.getState();
    expect(state).not.toHaveProperty('setNapkinsBasePath');
  });

  test('NapkinEntry type has absPath, entries, not artifacts', () => {
    // Create a napkin with the new shape — this will fail at compile time
    // if the types are wrong
    const napkin: NapkinEntry = {
      slug: 'test',
      absPath: '/tmp/test',
      entries: [
        { name: 'test.nap.md', absPath: '/tmp/test/test.nap.md', type: 'file' },
      ],
      napkinBullets: [],
      status: 'backlog',
    };

    // Verify runtime shape
    expect(napkin.absPath).toBe('/tmp/test');
    expect(napkin.entries).toHaveLength(1);
    expect(napkin.entries[0].type).toBe('file');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((napkin as any).artifacts).toBeUndefined();
  });
});
