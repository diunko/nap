import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { useTerminalStore } from '../../src/renderer/store';
import { disposeTerminal } from '../../src/renderer/terminal-registry';
import { KanbanOverlay } from '../../src/renderer/components/KanbanOverlay';

let container: HTMLDivElement;
let root: Root;

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

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function renderKanban() {
  act(() => {
    root.render(React.createElement(KanbanOverlay));
  });
}

// ---------------------------------------------------------------------------
// T-0600-07: kanban columns render napkins grouped by phase
// ---------------------------------------------------------------------------
describe('T-0600-07: kanban columns render napkins grouped by phase', () => {
  test('5 columns always present, cards distributed by status', () => {
    // Set up napkins with known statuses: 2 doing, 1 review, 1 done
    useTerminalStore.setState({
      kanbanVisible: true,
      napkins: [
        { slug: '0100-alpha', artifacts: [], agents: [], napkinBullets: [], status: 'doing' },
        { slug: '0200-beta', artifacts: [], agents: [], napkinBullets: [], status: 'doing' },
        { slug: '0300-gamma', artifacts: [], agents: [], napkinBullets: [], status: 'review' },
        { slug: '0400-delta', artifacts: [], agents: [], napkinBullets: [], status: 'done' },
      ],
    });

    renderKanban();

    // All 5 columns should exist
    const columns = ['backlog', 'todo', 'doing', 'review', 'done'];
    for (const col of columns) {
      const colEl = container.querySelector(`[data-testid="kanban-col-${col}"]`);
      expect(colEl, `column "${col}" should exist`).not.toBeNull();
    }

    // Check column headers show correct counts
    const doingCol = container.querySelector('[data-testid="kanban-col-doing"]');
    expect(doingCol!.textContent).toContain('(2)');

    const reviewCol = container.querySelector('[data-testid="kanban-col-review"]');
    expect(reviewCol!.textContent).toContain('(1)');

    const doneCol = container.querySelector('[data-testid="kanban-col-done"]');
    expect(doneCol!.textContent).toContain('(1)');

    const backlogCol = container.querySelector('[data-testid="kanban-col-backlog"]');
    expect(backlogCol!.textContent).toContain('(0)');

    const todoCol = container.querySelector('[data-testid="kanban-col-todo"]');
    expect(todoCol!.textContent).toContain('(0)');
  });

  test('napkins without status default to backlog column', () => {
    useTerminalStore.setState({
      kanbanVisible: true,
      napkins: [
        { slug: '0100-unset', artifacts: [], agents: [], napkinBullets: [], status: 'backlog' },
      ],
    });

    renderKanban();

    const backlogCol = container.querySelector('[data-testid="kanban-col-backlog"]');
    expect(backlogCol!.textContent).toContain('(1)');
    expect(backlogCol!.textContent).toContain('0100-unset');
  });
});

// ---------------------------------------------------------------------------
// T-0600-08: kanban cards show .nap.md bullets when expanded
// ---------------------------------------------------------------------------
describe('T-0600-08: kanban cards show .nap.md bullets when expanded', () => {
  test('expanded card shows napkinBullets text', () => {
    useTerminalStore.setState({
      kanbanVisible: true,
      napkins: [
        {
          slug: '0100-bullet-test',
          artifacts: [],
          agents: [],
          napkinBullets: ['connect real data', 'replace mocks'],
          status: 'doing',
        },
      ],
    });

    renderKanban();

    // Card should be collapsed initially — bullets not visible
    const overlay = container.querySelector('[data-testid="kanban-overlay"]');
    expect(overlay!.textContent).toContain('0100-bullet-test');
    expect(overlay!.textContent).not.toContain('connect real data');

    // Click card header to expand
    const doingCol = container.querySelector('[data-testid="kanban-col-doing"]');
    const cardHeader = doingCol!.querySelector('div[style]');
    // Find the clickable card slug text
    const cards = doingCol!.querySelectorAll('div');
    let clicked = false;
    for (const el of cards) {
      if (el.textContent?.includes('0100-bullet-test') && el.onclick !== null) {
        act(() => { el.click(); });
        clicked = true;
        break;
      }
    }
    if (!clicked) {
      // Click the first card header area
      const cardEl = doingCol!.querySelectorAll('div');
      for (const el of cardEl) {
        if (el.textContent?.includes('0100-bullet-test')) {
          act(() => { el.click(); });
          break;
        }
      }
    }

    // After expansion, bullets should be visible
    expect(overlay!.textContent).toContain('connect real data');
    expect(overlay!.textContent).toContain('replace mocks');
  });
});

// ---------------------------------------------------------------------------
// T-0600-09: kanban cards show artifact badges (filled vs dimmed)
// ---------------------------------------------------------------------------
describe('T-0600-09: kanban cards show artifact badges (filled vs dimmed)', () => {
  test('present artifacts are filled (#9cdcfe), missing are dimmed (#6b7280)', () => {
    useTerminalStore.setState({
      kanbanVisible: true,
      napkins: [
        {
          slug: '0100-badge-test',
          artifacts: ['.nap.md', '.spec.md'],
          agents: [],
          napkinBullets: [],
          status: 'doing',
        },
      ],
    });

    renderKanban();

    // Expand the card by clicking the slug span (bubbles to header onClick)
    const doingCol = container.querySelector('[data-testid="kanban-col-doing"]');
    const slugSpans = doingCol!.querySelectorAll('span');
    for (const span of slugSpans) {
      if (span.textContent?.trim() === '0100-badge-test') {
        act(() => { span.click(); });
        break;
      }
    }

    // Find badge spans — they contain 'nap', 'spec', 'test', 'journeys'
    // jsdom normalizes hex colors to rgb(), so compare using includes
    const allSpans = container.querySelectorAll('span');
    const badges: { text: string; color: string }[] = [];
    for (const span of allSpans) {
      const text = span.textContent?.trim() ?? '';
      if (['nap', 'spec', 'test', 'journeys'].includes(text)) {
        badges.push({ text, color: span.style.color });
      }
    }

    expect(badges.length).toBe(4);

    // 'nap' and 'spec' should be filled (rgb(156, 220, 254) = #9cdcfe)
    const napBadge = badges.find((b) => b.text === 'nap');
    expect(napBadge!.color).toContain('156');

    const specBadge = badges.find((b) => b.text === 'spec');
    expect(specBadge!.color).toContain('156');

    // 'test' and 'journeys' should be dimmed (rgb(107, 114, 128) = #6b7280)
    const testBadge = badges.find((b) => b.text === 'test');
    expect(testBadge!.color).toContain('107');

    const journeysBadge = badges.find((b) => b.text === 'journeys');
    expect(journeysBadge!.color).toContain('107');
  });
});

// ---------------------------------------------------------------------------
// T-0600-10: kanban cards show agent dots
// ---------------------------------------------------------------------------
describe('T-0600-10: kanban cards show agent dots', () => {
  test('3 agents with different statuses render 3 dots with correct colors', () => {
    useTerminalStore.setState({
      kanbanVisible: true,
      terminals: [
        { id: 't1', name: 'agent-1', status: 'running', createdAt: 1, napkinSlug: '0100-dots' },
        { id: 't2', name: 'agent-2', status: 'done', createdAt: 2, napkinSlug: '0100-dots' },
        { id: 't3', name: 'agent-3', status: 'exited', createdAt: 3, napkinSlug: '0100-dots' },
      ] as any,
      napkins: [
        {
          slug: '0100-dots',
          artifacts: [],
          agents: [{ name: '001-arch', files: [] }, { name: '002-eng', files: [] }, { name: '003-test', files: [] }],
          napkinBullets: [],
          status: 'doing',
        },
      ],
    });

    renderKanban();

    // Find the card in the doing column
    const doingCol = container.querySelector('[data-testid="kanban-col-doing"]');
    expect(doingCol).not.toBeNull();

    // StatusDot renders as <span> with border-radius: 50%
    const dots = doingCol!.querySelectorAll('span');
    const dotSpans = Array.from(dots).filter(
      (s) => s.style.borderRadius === '50%',
    );

    // 3 agents → 3 dots in the card header
    expect(dotSpans.length).toBe(3);

    // jsdom normalizes hex to rgb. Check colors via rgb values:
    // running=#22c55e → rgb(34, 197, 94) green filled
    // done=#3b82f6 → rgb(59, 130, 246) blue filled
    // exited=#6b7280 → rgb(107, 114, 128) gray hollow
    expect(dotSpans[0].style.background).toContain('34');  // green
    expect(dotSpans[1].style.background).toContain('59');  // blue
    // Exited: hollow (transparent bg, border with gray)
    expect(dotSpans[2].style.background).toBe('transparent');
    expect(dotSpans[2].style.border).toContain('107');
  });
});
