import { describe, test, expect, beforeEach } from 'vitest';
import { useTerminalStore } from '../../src/renderer/store';
import { disposeTerminal } from '../../src/renderer/terminal-registry';

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
// T-0600-18: store handles out-of-order IPC — status before filesystem
// ---------------------------------------------------------------------------
describe('T-0600-18: store handles out-of-order IPC — status before filesystem', () => {
  test('status arriving before filesystem data creates placeholder, filesystem merges correctly', () => {
    const store = useTerminalStore.getState();

    // Step 1: status arrives first (no filesystem data yet)
    store.mergeNapkinStatus('0100-alpha', 'doing');

    const afterStatus = useTerminalStore.getState();
    const placeholder = afterStatus.napkins.find((n) => n.slug === '0100-alpha');
    expect(placeholder).toBeDefined();
    expect(placeholder!.status).toBe('doing');
    expect(placeholder!.artifacts).toEqual([]);
    expect(placeholder!.agents).toEqual([]);
    expect(placeholder!.napkinBullets).toEqual([]);

    // Step 2: filesystem data arrives later
    store.setNapkinData({
      slug: '0100-alpha',
      artifacts: ['.nap.md', '.spec.md'],
      agents: ['001-fs-eng'],
      napkinBullets: ['connect real data'],
    });

    const afterFs = useTerminalStore.getState();
    const merged = afterFs.napkins.find((n) => n.slug === '0100-alpha');
    expect(merged).toBeDefined();
    expect(merged!.status).toBe('doing'); // preserved from status IPC
    expect(merged!.artifacts).toEqual(['.nap.md', '.spec.md']); // from filesystem
    expect(merged!.agents).toEqual(['001-fs-eng']); // from filesystem
    expect(merged!.napkinBullets).toEqual(['connect real data']); // from filesystem
  });

  test('filesystem arriving before status — status merges without clobbering', () => {
    const store = useTerminalStore.getState();

    // Step 1: filesystem data arrives first
    store.setNapkinData({
      slug: '0200-beta',
      artifacts: ['.nap.md'],
      agents: ['001-test-arch'],
      napkinBullets: ['bootstrap sqlite'],
    });

    const afterFs = useTerminalStore.getState();
    const napkin = afterFs.napkins.find((n) => n.slug === '0200-beta');
    expect(napkin).toBeDefined();
    expect(napkin!.status).toBe('backlog'); // default
    expect(napkin!.artifacts).toEqual(['.nap.md']);

    // Step 2: status arrives later
    store.mergeNapkinStatus('0200-beta', 'review');

    const afterStatus = useTerminalStore.getState();
    const merged = afterStatus.napkins.find((n) => n.slug === '0200-beta');
    expect(merged).toBeDefined();
    expect(merged!.status).toBe('review'); // updated
    expect(merged!.artifacts).toEqual(['.nap.md']); // preserved
    expect(merged!.agents).toEqual(['001-test-arch']); // preserved
    expect(merged!.napkinBullets).toEqual(['bootstrap sqlite']); // preserved
  });

  test('multiple filesystem updates preserve status', () => {
    const store = useTerminalStore.getState();

    // Set initial data + status
    store.setNapkinData({
      slug: '0300-gamma',
      artifacts: ['.nap.md'],
      agents: [],
      napkinBullets: ['initial'],
    });
    store.mergeNapkinStatus('0300-gamma', 'doing');

    // Filesystem update with new artifacts
    store.setNapkinData({
      slug: '0300-gamma',
      artifacts: ['.nap.md', '.spec.md'],
      agents: ['001-fs-eng'],
      napkinBullets: ['initial', 'added'],
    });

    const final = useTerminalStore.getState().napkins.find((n) => n.slug === '0300-gamma');
    expect(final!.status).toBe('doing'); // status preserved across filesystem update
    expect(final!.artifacts).toEqual(['.nap.md', '.spec.md']); // updated
    expect(final!.agents).toEqual(['001-fs-eng']); // updated
  });

  test('setNapkinData with array creates multiple napkins', () => {
    const store = useTerminalStore.getState();
    store.setNapkinData([
      { slug: '0100-a', artifacts: ['.nap.md'], agents: [], napkinBullets: [] },
      { slug: '0200-b', artifacts: ['.spec.md'], agents: ['001-eng'], napkinBullets: ['bullet'] },
    ]);

    const napkins = useTerminalStore.getState().napkins;
    expect(napkins).toHaveLength(2);
    expect(napkins[0].slug).toBe('0100-a');
    expect(napkins[1].slug).toBe('0200-b');
    expect(napkins[1].agents).toEqual(['001-eng']);
  });

  test('toggleKanban flips kanbanVisible', () => {
    expect(useTerminalStore.getState().kanbanVisible).toBe(false);
    useTerminalStore.getState().toggleKanban();
    expect(useTerminalStore.getState().kanbanVisible).toBe(true);
    useTerminalStore.getState().toggleKanban();
    expect(useTerminalStore.getState().kanbanVisible).toBe(false);
  });
});
