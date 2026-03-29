import { describe, it, expect, vi, afterEach } from 'vitest';
import { createModel } from '../src/main/model';
import { FakeBridge, wireModelToBridge } from '../src/main/bridge';
import type { AppSnapshot } from '../src/shared/bridge-types';
import {
  createMinimalFixture,
  createLifecycleFixture,
  createMultiNapkinLifecycleFixture,
  NEPIC_DIR,
} from './fixtures';

// ── Async migration ──

describe('Async migration', () => {
  // T-0150-02
  it('loadFromFilesystem returns a Promise', async () => {
    const fs = createMinimalFixture();
    const model = createModel(fs);

    const result = model.loadFromFilesystem(NEPIC_DIR);
    expect(result).toBeInstanceOf(Promise);

    // State not yet populated (async hasn't resolved)
    expect(model.getNapkins()).toEqual([]);

    await result;
    expect(model.getNapkins()).toHaveLength(1);
  });

  // T-0150-03
  it('MemoryFileSystem async methods return resolved promises', async () => {
    const fs = createMinimalFixture();
    const napkinsDir = 'nepic/30-napkins';

    expect(fs.readdir(napkinsDir)).toBeInstanceOf(Promise);
    const dirs = await fs.readdir(napkinsDir);
    expect(dirs).toContain('0100-explore');

    expect(fs.readJSON(napkinsDir + '/0100-explore/.napkin.nap.json')).toBeInstanceOf(Promise);
    const marker = await fs.readJSON(napkinsDir + '/0100-explore/.napkin.nap.json');
    expect(marker).toMatchObject({ status: 'doing' });

    expect(fs.isDirectory(napkinsDir + '/0100-explore')).toBeInstanceOf(Promise);
    const isDir = await fs.isDirectory(napkinsDir + '/0100-explore');
    expect(isDir).toBe(true);
  });
});

// ── Filesystem watching ──

describe('Filesystem watching', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // T-0150-10
  it('watch callback fires on simulateChange', () => {
    const fs = createLifecycleFixture();
    const napkinsDir = 'nepic/30-napkins';

    const spy = vi.fn();
    fs.watch(napkinsDir, spy);
    fs.simulateChange(napkinsDir + '/0100-explore/.napkin.nap.json');

    expect(spy).toHaveBeenCalledWith('change', '0100-explore/.napkin.nap.json');
  });

  // T-0150-11
  it('watch unsubscribe stops callbacks', () => {
    const fs = createLifecycleFixture();
    const napkinsDir = 'nepic/30-napkins';

    const spy = vi.fn();
    const unsub = fs.watch(napkinsDir, spy);
    unsub();
    fs.simulateChange(napkinsDir + '/0100-explore/.napkin.nap.json');

    expect(spy).not.toHaveBeenCalled();
  });

  // T-0150-12
  it('debounce — rapid changes produce single model update', async () => {
    vi.useFakeTimers();
    const fs = createLifecycleFixture();
    const model = createModel(fs);
    const changeSpy = vi.fn();
    model.onChange(changeSpy);

    await model.loadFromFilesystem(NEPIC_DIR);
    changeSpy.mockClear(); // clear the load notification

    model.startWatching(NEPIC_DIR);
    const markerPath = 'nepic/30-napkins/0100-explore/.napkin.nap.json';

    for (let i = 0; i < 10; i++) {
      fs.simulateChange(markerPath);
    }

    await vi.advanceTimersByTimeAsync(200);
    expect(changeSpy).toHaveBeenCalledTimes(1);
  });

  // T-0150-13
  it('watch detects marker file change → model re-reads → onChange fires', async () => {
    vi.useFakeTimers();
    const fs = createLifecycleFixture();
    const model = createModel(fs);

    await model.loadFromFilesystem(NEPIC_DIR);
    model.startWatching(NEPIC_DIR);
    expect(model.getNapkins()[0].status).toBe('doing');

    // External process changes the marker
    const markerPath = 'nepic/30-napkins/0100-explore/.napkin.nap.json';
    fs.updateFile(markerPath, { status: 'done' });
    fs.simulateChange(markerPath);
    await vi.advanceTimersByTimeAsync(200);

    expect(model.getNapkins()[0].status).toBe('done');
  });

  // T-0150-14
  it('watch detects new agent dir → model shows new agent', async () => {
    vi.useFakeTimers();
    const fs = createLifecycleFixture();
    const model = createModel(fs);

    await model.loadFromFilesystem(NEPIC_DIR);
    expect(model.getNapkins()[0].agents).toHaveLength(1);

    model.startWatching(NEPIC_DIR);

    // External process creates a new agent
    const agentMarkerPath =
      'nepic/30-napkins/0100-explore/agents/002-fs-eng/.agent.nap.json';
    fs.addFile(agentMarkerPath, {
      role: 'fs-eng',
      name: '002-fs-eng',
      created_at: Date.now(),
    });
    fs.simulateChange('nepic/30-napkins/0100-explore/agents');
    await vi.advanceTimersByTimeAsync(200);

    expect(model.getNapkins()[0].agents).toHaveLength(2);
  });
});

// ── Write-back ──

describe('Write-back', () => {
  // T-0150-20
  it('createAgent writes .agent.nap.json', async () => {
    const fs = createLifecycleFixture();
    const model = createModel(fs);

    await model.loadFromFilesystem(NEPIC_DIR);
    await model.createAgent('0100-explore', { name: '002-fs-eng', role: 'fs-eng' });

    // Assert on filesystem
    const written = await fs.readJSON(
      'nepic/30-napkins/0100-explore/agents/002-fs-eng/.agent.nap.json',
    );
    expect(written).toMatchObject({ name: '002-fs-eng', role: 'fs-eng' });

    // Assert on model state
    const agents = model.getNapkins()[0].agents;
    expect(agents).toHaveLength(2);
    expect(agents.find((a) => a.name === '002-fs-eng')).toBeDefined();
  });

  // T-0150-21
  it('setAgentExited updates marker with exited: true', async () => {
    const fs = createLifecycleFixture();
    const model = createModel(fs);

    await model.loadFromFilesystem(NEPIC_DIR);
    await model.setAgentExited('0100-explore', '001-test-arch');

    const agentMarkerPath =
      'nepic/30-napkins/0100-explore/agents/001-test-arch/.agent.nap.json';
    const marker = (await fs.readJSON(agentMarkerPath)) as any;
    expect(marker.exited).toBe(true);
    expect(marker.cc_session_uuid).toBe('uuid-ta'); // preserved

    expect(model.getNapkins()[0].agents[0].exited).toBe(true);
  });

  // T-0150-22
  it('setNapkinStatus writes .napkin.nap.json', async () => {
    const fs = createLifecycleFixture();
    const model = createModel(fs);

    await model.loadFromFilesystem(NEPIC_DIR);
    await model.setNapkinStatus('0100-explore', 'review');

    const napkinMarkerPath = 'nepic/30-napkins/0100-explore/.napkin.nap.json';
    const marker = (await fs.readJSON(napkinMarkerPath)) as any;
    expect(marker.status).toBe('review');

    expect(model.getNapkins()[0].status).toBe('review');
  });

  // T-0150-23
  it('saveUiState writes ui-state.json', async () => {
    const fs = createLifecycleFixture();
    const model = createModel(fs);

    await model.loadFromFilesystem(NEPIC_DIR);
    await model.saveUiState({ activeNepicId: 'nepic-01', activeTerminalId: 'uuid-ta' });

    const written = (await fs.readJSON('nepic/ui-state.json')) as any;
    expect(written).toMatchObject({ activeNepicId: 'nepic-01', activeTerminalId: 'uuid-ta' });
  });

  // T-0150-24
  it('createAgent fires onChange', async () => {
    const fs = createLifecycleFixture();
    const model = createModel(fs);

    await model.loadFromFilesystem(NEPIC_DIR);
    const spy = vi.fn();
    model.onChange(spy);

    await model.createAgent('0100-explore', { name: '002-fs-eng', role: 'fs-eng' });
    expect(spy).toHaveBeenCalled();
  });
});

// ── Write-then-watch loop prevention ──

describe('Write-then-watch loop prevention', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // T-0150-30
  it('model write → watch fires → model does NOT re-process its own write', async () => {
    vi.useFakeTimers();
    const fs = createLifecycleFixture();
    const model = createModel(fs);

    await model.loadFromFilesystem(NEPIC_DIR);
    model.startWatching(NEPIC_DIR);

    const spy = vi.fn();
    model.onChange(spy);

    await model.createAgent('0100-explore', { name: '002-fs-eng', role: 'fs-eng' });
    await vi.advanceTimersByTimeAsync(200); // let debounce settle

    // onChange from createAgent: 1 call. Watch echo: suppressed.
    expect(spy).toHaveBeenCalledTimes(1);
    expect(model.getNapkins()[0].agents).toHaveLength(2);
  });

  // T-0150-31
  it('external write → watch fires → model DOES re-process', async () => {
    vi.useFakeTimers();
    const fs = createLifecycleFixture();
    const model = createModel(fs);

    await model.loadFromFilesystem(NEPIC_DIR);
    model.startWatching(NEPIC_DIR);
    const spy = vi.fn();
    model.onChange(spy);

    // External process changes status (not through model)
    const napkinMarkerPath = 'nepic/30-napkins/0100-explore/.napkin.nap.json';
    fs.updateFile(napkinMarkerPath, { status: 'done' });
    fs.simulateChange(napkinMarkerPath);
    await vi.advanceTimersByTimeAsync(200);

    expect(spy).toHaveBeenCalled();
    expect(model.getNapkins()[0].status).toBe('done');
  });

  // T-0150-32
  it('pending-write ignore window clears after debounce', async () => {
    vi.useFakeTimers();
    const fs = createLifecycleFixture();
    const model = createModel(fs);

    await model.loadFromFilesystem(NEPIC_DIR);
    model.startWatching(NEPIC_DIR);

    await model.setNapkinStatus('0100-explore', 'review');
    await vi.advanceTimersByTimeAsync(200); // debounce settles, pending-write clears

    const spy = vi.fn();
    model.onChange(spy);

    // Now an external write to the same path
    const napkinMarkerPath = 'nepic/30-napkins/0100-explore/.napkin.nap.json';
    fs.updateFile(napkinMarkerPath, { status: 'done' });
    fs.simulateChange(napkinMarkerPath);
    await vi.advanceTimersByTimeAsync(200);

    expect(spy).toHaveBeenCalled();
    expect(model.getNapkins()[0].status).toBe('done');
  });
});

// ── Lifecycle journey tests ──

describe('Lifecycle journeys (small)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // T-0150-40
  it('journey — load → create agent → marker written → model shows new agent', async () => {
    const fs = createLifecycleFixture();
    const model = createModel(fs);
    const bridge = new FakeBridge();
    wireModelToBridge(model, bridge, 'nepic-01');

    let snapshot: AppSnapshot | null = null;
    bridge.onSnapshot((s) => (snapshot = s));

    await model.loadFromFilesystem(NEPIC_DIR);
    await model.createAgent('0100-explore', {
      name: '002-fs-eng',
      role: 'fs-eng',
      cc_session_uuid: 'uuid-new',
    });

    // Filesystem
    const agentPath =
      'nepic/30-napkins/0100-explore/agents/002-fs-eng/.agent.nap.json';
    const marker = await fs.readJSON(agentPath);
    expect(marker).toMatchObject({ name: '002-fs-eng', role: 'fs-eng' });

    // Model
    expect(model.getNapkins()[0].agents).toHaveLength(2);

    // Bridge → renderer
    expect(snapshot!.napkins[0].agents).toHaveLength(2);
    expect(snapshot!.napkins[0].agents.find((a) => a.name === '002-fs-eng')).toBeDefined();
  });

  // T-0150-41
  it('journey — load → agent exits → marker updated → model shows exited flag', async () => {
    const fs = createLifecycleFixture();
    const model = createModel(fs);
    const bridge = new FakeBridge();
    wireModelToBridge(model, bridge, 'nepic-01');

    let snapshot: AppSnapshot | null = null;
    bridge.onSnapshot((s) => (snapshot = s));

    await model.loadFromFilesystem(NEPIC_DIR);
    await model.setAgentExited('0100-explore', '001-test-arch');

    expect(model.getNapkins()[0].agents[0].exited).toBe(true);
    expect(snapshot!.napkins[0].agents[0].exited).toBe(true);

    const agentMarkerPath =
      'nepic/30-napkins/0100-explore/agents/001-test-arch/.agent.nap.json';
    const marker = (await fs.readJSON(agentMarkerPath)) as any;
    expect(marker.exited).toBe(true);
  });

  // T-0150-42
  it('journey — load → status change → marker updated → model reflects new status', async () => {
    const fs = createLifecycleFixture();
    const model = createModel(fs);
    const bridge = new FakeBridge();
    wireModelToBridge(model, bridge, 'nepic-01');

    let snapshot: AppSnapshot | null = null;
    bridge.onSnapshot((s) => (snapshot = s));

    await model.loadFromFilesystem(NEPIC_DIR);
    await model.setNapkinStatus('0100-explore', 'review');

    expect(model.getNapkins()[0].status).toBe('review');
    expect(snapshot!.napkins[0].status).toBe('review');
  });

  // T-0150-43
  it('journey — full cycle: load → create agent → save UI state → reload → same state', async () => {
    const fs = createLifecycleFixture();

    // Phase 1: populate
    const model1 = createModel(fs);
    await model1.loadFromFilesystem(NEPIC_DIR);
    await model1.createAgent('0100-explore', {
      name: '002-fs-eng',
      role: 'fs-eng',
      cc_session_uuid: 'uuid-new',
    });
    await model1.setNapkinStatus('0100-explore', 'review');
    await model1.saveUiState({ activeNepicId: 'nepic-01', activeTerminalId: 'uuid-ta' });

    // Phase 2: reload (new model instance, same filesystem)
    const model2 = createModel(fs);
    await model2.loadFromFilesystem(NEPIC_DIR);

    // Persistent state preserved
    expect(model2.getNapkins()[0].agents).toHaveLength(2);
    expect(model2.getNapkins()[0].agents.find((a) => a.name === '002-fs-eng')).toBeDefined();
    expect(model2.getNapkins()[0].status).toBe('review');

    // UI state retrievable
    const uiState = (await fs.readJSON('nepic/ui-state.json')) as any;
    expect(uiState).toMatchObject({ activeNepicId: 'nepic-01' });
  });

  // T-0150-44
  it('journey — external change → watcher → model updates → bridge pushes', async () => {
    vi.useFakeTimers();
    const fs = createLifecycleFixture();
    const model = createModel(fs);
    const bridge = new FakeBridge();
    wireModelToBridge(model, bridge, 'nepic-01');

    let latestSnapshot: AppSnapshot | null = null;
    bridge.onSnapshot((s) => (latestSnapshot = s));

    await model.loadFromFilesystem(NEPIC_DIR);
    model.startWatching(NEPIC_DIR);

    // External change
    const napkinMarkerPath = 'nepic/30-napkins/0100-explore/.napkin.nap.json';
    fs.updateFile(napkinMarkerPath, { status: 'done' });
    fs.simulateChange(napkinMarkerPath);
    await vi.advanceTimersByTimeAsync(200);

    expect(latestSnapshot!.napkins[0].status).toBe('done');
  });

  // T-0150-45
  it('journey — write-then-watch full chain, no feedback loop', async () => {
    vi.useFakeTimers();
    const fs = createLifecycleFixture();
    const model = createModel(fs);
    const bridge = new FakeBridge();
    wireModelToBridge(model, bridge, 'nepic-01');

    await model.loadFromFilesystem(NEPIC_DIR);
    model.startWatching(NEPIC_DIR);

    const snapshots: AppSnapshot[] = [];
    bridge.onSnapshot((s) => snapshots.push(structuredClone(s)));

    await model.createAgent('0100-explore', { name: '002-fs-eng', role: 'fs-eng' });
    await vi.advanceTimersByTimeAsync(200);

    // Exactly one snapshot from the write, zero from the watch echo
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].napkins[0].agents).toHaveLength(2);
  });
});
