import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock monaco-editor BEFORE any imports that transitively touch it
vi.mock('monaco-editor', () => ({
  default: {},
  editor: { defineTheme: vi.fn(), setTheme: vi.fn() },
}));
vi.stubGlobal('document', {
  documentElement: { style: { setProperty: vi.fn() } },
});
if (typeof window === 'undefined') {
  vi.stubGlobal('window', globalThis);
}

import { createModel } from '../src/main/model';
import { MemoryFileSystem } from '../src/main/filesystem';
import { useNapStore, loadPersistedUiState, _resetNepicTerminalMemory } from '../src/renderer/store';

const NEPIC_DIR = 'nepic';

// ── Helpers ──

/** Create a fixture with one napkin, one agent, one architect */
function createFixture() {
  return new MemoryFileSystem({
    'nepic/30-napkins/0100-explore/.napkin.nap.json': { status: 'doing' },
    'nepic/30-napkins/0100-explore/agents/001-test-arch/.agent.nap.json': {
      cc_session_uuid: 'uuid-ta',
      role: 'test-arch',
      name: '001-test-arch',
      napkin: '0100-explore',
      nepic: 'test-nepic',
      created_at: 1711700000000,
      started: true,
      exited: false,
    },
    'nepic/20-architects/001-architect/.agent.nap.json': {
      cc_session_uuid: 'uuid-arch',
      role: 'architect',
      name: '001-architect',
      nepic: 'test-nepic',
      created_at: 1711600000000,
      started: true,
      exited: false,
    },
  });
}

/** Create a DelayFileSystem that wraps MemoryFileSystem with per-call delays */
class DelayFileSystem extends MemoryFileSystem {
  private delays = new Map<string, number>();

  constructor(files: Record<string, object | string | null>) {
    super(files);
  }

  setDelay(method: string, pattern: string, ms: number) {
    this.delays.set(`${method}:${pattern}`, ms);
  }

  private async maybeDelay(method: string, key: string) {
    for (const [pat, ms] of this.delays) {
      const [m, p] = pat.split(':');
      if (m === method && key.includes(p)) {
        await new Promise(r => setTimeout(r, ms));
        return;
      }
    }
  }

  async readdir(dir: string): Promise<string[]> {
    await this.maybeDelay('readdir', dir);
    return super.readdir(dir);
  }

  async readJSON(filePath: string): Promise<unknown | null> {
    await this.maybeDelay('readJSON', filePath);
    return super.readJSON(filePath);
  }

  async writeJSON(filePath: string, data: unknown): Promise<void> {
    await this.maybeDelay('writeJSON', filePath);
    return super.writeJSON(filePath, data);
  }
}

// RACE-04: concurrent loadFromFilesystem with identical filesystem can't produce different
// data. The reentrancy race is proven by RACE-15 (nepic switch loads different dirs).

// RACE-06, RACE-08: ephemeral Sets (doneAgents, runningAgents) mask the race in-memory.
// Moved to medium tests — restart the app to prove disk-level data loss.

// ── T-RACE-09: socket-handler doesn't await setAgentDone ──

describe('RACE-09: socket-handler done + immediate exit — done flag lost', () => {
  it.fails('setAgentDone not awaited — exit reads stale marker', async () => {
    const fs = new DelayFileSystem({
      'nepic/30-napkins/0100-explore/.napkin.nap.json': { status: 'doing' },
      'nepic/30-napkins/0100-explore/agents/001-ta/.agent.nap.json': {
        cc_session_uuid: 'uuid-ta', role: 'test-arch', name: '001-ta',
        created_at: 1711700000000, started: true, exited: false,
      },
      'nepic/20-architects/001-architect/.agent.nap.json': {
        cc_session_uuid: 'uuid-arch', role: 'architect', name: '001-architect',
        created_at: 1711600000000, started: true, exited: false,
      },
    });

    // Slow agent marker writes
    fs.setDelay('writeJSON', '.agent.nap.json', 100);

    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);

    // Simulate what socket-handler does: call setAgentDone WITHOUT await
    model.setAgentDone('uuid-ta'); // fire-and-forget, like socket-handler.ts:86

    // Immediately call setAgentExitedById (simulates pty exit arriving right after done)
    await model.setAgentExitedById('uuid-ta');

    // Now read the marker file from disk — should have BOTH done and exited
    const marker = await fs.readJSON(
      'nepic/30-napkins/0100-explore/agents/001-test-arch/.agent.nap.json'
    ) as any;

    // Wait for the fire-and-forget done write to complete
    await new Promise(r => setTimeout(r, 200));
    const markerAfter = await fs.readJSON(
      'nepic/30-napkins/0100-explore/agents/001-test-arch/.agent.nap.json'
    ) as any;

    // At least one of the reads should have both flags
    // The bug: setAgentExitedById reads the marker before done is written,
    // so the marker it writes has exited:true but no done:true
    expect(markerAfter?.done).toBe(true);
    expect(markerAfter?.exited).toBe(true);
  });
});

// ── T-RACE-10: Ghost promotion during tab restore ──

function resetStore() {
  _resetNepicTerminalMemory();
  useNapStore.setState({
    napkins: [], architects: [], activeNepicId: '', activeTerminalId: null,
    activeFilePath: null, focusedCardSlug: null, cardViewMode: 'collapsed',
    nepics: [], watcherEvents: [], leftTabs: [], activeLeftTabId: null,
    rightTabs: [], activeRightTabId: null, leftPaneRenderMode: 'edit',
    _fileReloadVersion: 0,
  });
}

describe('RACE-10: ghost file appears during loadPersistedUiState', () => {
  beforeEach(resetStore);
  afterEach(() => { delete (window as any).electronAPI; });

  it.fails('ghost-appeared event during restore — tab stays ghost', async () => {
    let watchGhostCallCount = 0;
    let resolveWatchGhost: () => void;

    (window as any).electronAPI = {
      loadUiState: vi.fn().mockResolvedValue({
        leftTabs: [
          { path: '/live.md', ephemeral: false },
          { path: '/ghost.md', ephemeral: false },
        ],
        activeLeftTabPath: '/live.md',
      }),
      fileRead: vi.fn().mockImplementation((path: string) => {
        if (path === '/ghost.md') return Promise.resolve(null);
        return Promise.resolve('content');
      }),
      watchGhost: vi.fn().mockImplementation(() => {
        watchGhostCallCount++;
        return new Promise<void>(resolve => {
          // Hold the promise — we'll resolve it after simulating ghost-appeared
          resolveWatchGhost = resolve;
        });
      }),
      unwatchGhost: vi.fn(),
    };

    // Start restore — it will await watchGhost for /ghost.md
    const restorePromise = loadPersistedUiState();

    // Wait for watchGhost to be called
    await vi.waitFor(() => expect(watchGhostCallCount).toBe(1));

    // Simulate ghost file appearing NOW — between watchGhost and setState
    useNapStore.getState().promoteGhostTab('/ghost.md');

    // Let watchGhost complete
    resolveWatchGhost!();
    await restorePromise;

    // The ghost tab should have been promoted
    const state = useNapStore.getState();
    const ghostTab = state.leftTabs.find((t: any) => t.path === '/ghost.md');

    // BUG: promoteGhostTab fired when leftTabs was empty (before setState),
    // so it found no matching tab and did nothing. Tab is still ghost.
    expect(ghostTab).toBeDefined();
    expect(ghostTab?.ghost).toBeFalsy();
  });
});

// ── T-RACE-11: applySnapshot during loadPersistedUiState ──

describe('RACE-11: snapshot arrives mid-restore — persisted card lost', () => {
  beforeEach(resetStore);
  afterEach(() => { delete (window as any).electronAPI; });

  it.fails('focusedCardSlug lost when snapshot has not arrived before restore reads napkins', async () => {
    // Saved state references a napkin slug
    (window as any).electronAPI = {
      loadUiState: vi.fn().mockResolvedValue({
        focusedCardSlug: '0100-explore',
        cardViewMode: 'extended',
      }),
      fileRead: vi.fn().mockResolvedValue(null),
      watchGhost: vi.fn().mockResolvedValue(undefined),
    };

    // Model has NO napkins yet (snapshot hasn't arrived)
    // loadPersistedUiState reads useNapStore.getState().napkins to validate slug
    await loadPersistedUiState();

    // The slug should be restored — but it won't be because napkins is empty
    const state = useNapStore.getState();
    expect(state.focusedCardSlug).toBe('0100-explore');
    expect(state.cardViewMode).toBe('extended');
  });
});

// ── T-RACE-12: spawnSuccessor — stale id during async ──

describe('RACE-12: spawnSuccessor — agent.id mutated before disk write', () => {
  it.fails('old id vanishes mid-spawn — disk still has old UUID', async () => {
    const fs = new DelayFileSystem({
      'nepic/30-napkins/0100-explore/.napkin.nap.json': { status: 'doing' },
      'nepic/30-napkins/0100-explore/agents/001-ta/.agent.nap.json': {
        cc_session_uuid: 'uuid-old', role: 'test-arch', name: '001-ta',
        created_at: 1711700000000, started: true, exited: true, archived: true,
      },
      'nepic/20-architects/001-architect/.agent.nap.json': {
        cc_session_uuid: 'uuid-arch', role: 'architect', name: '001-architect',
        created_at: 1711600000000, started: true, exited: false,
      },
    });

    // Slow disk writes so we can inspect mid-spawn
    fs.setDelay('writeJSON', '.agent.nap.json', 200);

    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);

    // Confirm old id exists
    expect(model.getAllAgents().find(a => a.id === 'uuid-old')).toBeDefined();

    const mockPty = {
      spawn: vi.fn(),
      onExit: vi.fn(),
      isRunning: vi.fn().mockReturnValue(false),
    };

    // Start spawnSuccessor — id mutated in-place, disk write takes 200ms
    const spawnPromise = model.spawnSuccessor('uuid-old', mockPty as any);
    await new Promise(r => setTimeout(r, 10)); // let sync part run

    // Memory: agent.id is already the new UUID
    const byOldId = model.getAllAgents().find(a => a.id === 'uuid-old');
    // BUG: old id gone from memory before disk write completes
    expect(byOldId).toBeDefined(); // fails — proves the race

    // Disk: marker still has old UUID (write hasn't completed)
    const marker = await fs.readJSON(
      'nepic/30-napkins/0100-explore/agents/001-ta/.agent.nap.json',
    ) as any;
    // Memory says new id, disk says old id — inconsistent
    expect(marker.cc_session_uuid).not.toBe('uuid-old'); // also fails — disk still has old

    await spawnPromise;
  });
});

// ── T-RACE-13: saveUiState — read-merge-write race ──

describe('RACE-13: concurrent saveUiState — lost update', () => {
  it.fails('two concurrent saves — first save fields lost', async () => {
    const fs = new DelayFileSystem({
      'nepic/ui-state.json': { theme: 'dark' },
      'nepic/30-napkins/0100-explore/.napkin.nap.json': { status: 'doing' },
      'nepic/20-architects/001-architect/.agent.nap.json': {
        cc_session_uuid: 'uuid-arch', role: 'architect', name: '001-architect',
        created_at: 1711600000000,
      },
    });

    // Slow reads AND writes so both calls read the same initial state
    // before either writes. This forces the lost-update race.
    fs.setDelay('readJSON', 'ui-state.json', 50);
    fs.setDelay('writeJSON', 'ui-state.json', 50);

    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);

    // Two concurrent saves — both read { theme: 'dark' }, merge independently, write independently
    const saveA = model.saveUiState({ focusedCardSlug: 'slug-A' });
    const saveB = model.saveUiState({ debugPanelCollapsed: true });

    await Promise.all([saveA, saveB]);

    // Read the final result
    const saved = await fs.readJSON('nepic/ui-state.json') as any;

    // All three fields should be present
    // BUG: saveB reads { theme: 'dark' } (before saveA writes), merges to
    // { theme: 'dark', debugPanelCollapsed: true }, writes — losing slug-A
    expect(saved.theme).toBe('dark');
    expect(saved.focusedCardSlug).toBe('slug-A');
    expect(saved.debugPanelCollapsed).toBe(true);
  });
});

// ── T-RACE-15: double nepic switch — watchers on wrong nepic ──

describe('RACE-15: double nepic switch — watchers inconsistent', () => {
  it.fails('concurrent switches — architects from wrong nepic', async () => {
    // Nepics as siblings under a common parent (real structure)
    const fs = new DelayFileSystem({
      'nepics/nepic-a/30-napkins/0100-explore/.napkin.nap.json': { status: 'doing' },
      'nepics/nepic-a/20-architects/001-architect/.agent.nap.json': {
        cc_session_uuid: 'uuid-a-arch', role: 'architect', name: 'arch-a',
        created_at: 1711600000000,
      },
      'nepics/nepic-b/30-napkins/0200-build/.napkin.nap.json': { status: 'backlog' },
      'nepics/nepic-b/20-architects/001-architect/.agent.nap.json': {
        cc_session_uuid: 'uuid-b-arch', role: 'architect', name: 'arch-b',
        created_at: 1711600000000,
      },
    });

    const model = createModel(fs);
    await model.loadFromFilesystem('nepics/nepic-a');
    expect(model.getActiveNepicId()).toBe('nepic-a');

    // Make nepic-b reads slow (200ms) — switch-to-B's loadFromFilesystem
    // reads napkins, assigns them, then blocks on architects.
    // Meanwhile switch-to-A finishes entirely, setting nepicDir to nepic-a.
    // Then B's architect read completes — architects from nepic-b overwrite nepic-a's.
    fs.setDelay('readdir', 'nepic-b', 200);

    // Switch to B (slow), then switch to A (fast)
    const switchToB = model.switchNepic('nepic-b');
    await new Promise(r => setTimeout(r, 50)); // let B start and set nepicDir
    const switchToA = model.switchNepic('nepic-a');

    await Promise.all([switchToB.catch(() => {}), switchToA.catch(() => {})]);

    const nepicId = model.getActiveNepicId();
    const napkins = model.getNapkins();
    const architects = model.getArchitects();

    // Key invariant: all state should agree on which nepic we're on.
    // nepicId should match napkins should match architects.
    if (nepicId === 'nepic-a') {
      expect(napkins.some(n => n.slug === '0100-explore')).toBe(true);
      // BUG: architects may be from nepic-b (B's load finished last for architects)
      expect(architects[0]?.name).toBe('arch-a');
    } else {
      expect(napkins.some(n => n.slug === '0200-build')).toBe(true);
      expect(architects[0]?.name).toBe('arch-b');
    }
  });
});

// T-RACE-06: moved to medium test (needs app restart to prove disk-level data loss)
// T-RACE-08: moved to medium test (same — ephemeral Sets mask the race in-process)
// T-RACE-16: moved to separate file (needs vi.mock('@parcel/watcher'))
