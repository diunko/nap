import { describe, it, expect, vi } from 'vitest';
import { createModel } from '../src/main/model';
import { FakeBridge, wireModelToBridge } from '../src/main/bridge';
import { FakePtySpawner } from '../src/main/pty-spawner';
import { computeResumeActions } from '../src/main/resume';
import { startAgents, stopApp } from '../src/main/coordinators';
import type { AppSnapshot } from '../src/shared/bridge-types';
import {
  createSurvivabilityFixture,
  createAllExitedFixture,
  NEPIC_DIR,
} from './fixtures';

// ── Full entity shapes ──

describe('Full entity shapes', () => {
  // T-0200-01
  it('AgentState has all spec fields', async () => {
    const fs = createSurvivabilityFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);

    const agent = model.getNapkins()[0].agents[0]; // 001-test-arch
    expect(agent.id).toBe('uuid-ta');
    expect(agent.name).toBe('001-test-arch');
    expect(agent.role).toBe('test-arch');
    expect(agent.nepicId).toBe('test-nepic');
    expect(agent.napkinId).toBe('0100-explore');
    expect(agent.parentName).toBeNull();
    expect(agent.parentId).toBeNull();
    expect(agent.createdAt).toBe(1711700000000);
    expect(agent.started).toBe(true);
    expect(agent.exited).toBe(false);
    expect(agent.running).toBe(false);
    expect(agent.done).toBe(false);
    expect(agent.homePath).toContain('agents/001-test-arch');
  });

  // T-0200-02
  it('AgentState parent fields populated from marker', async () => {
    const fs = createSurvivabilityFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);

    const agent = model.getNapkins()[0].agents[1]; // 002-fs-eng (sorted by createdAt)
    expect(agent.parentName).toBe('001-test-arch');
    expect(agent.parentId).toBe('uuid-ta');
  });

  // T-0200-03
  it('NapkinState has full spec fields', async () => {
    const fs = createSurvivabilityFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);

    const napkin = model.getNapkins()[0];
    expect(napkin.id).toBe('0100-explore');
    expect(napkin.slug).toBe('0100-explore');
    expect(napkin.nepicId).toBe('test-nepic');
    expect(napkin.path).toContain('30-napkins/0100-explore');
    expect(napkin.agents).toHaveLength(2);
  });

  // T-0200-04
  it('Bridge snapshot delivers full entity shapes', async () => {
    const fs = createSurvivabilityFixture();
    const model = createModel(fs);
    const bridge = new FakeBridge();
    wireModelToBridge(model, bridge, 'test-nepic');

    let snapshot: AppSnapshot | null = null;
    bridge.onSnapshot((s) => (snapshot = s));

    await model.loadFromFilesystem(NEPIC_DIR);

    expect(snapshot).not.toBeNull();
    expect(snapshot!.napkins[0].nepicId).toBe('test-nepic');
    expect(snapshot!.napkins[0].agents[0].id).toBe('uuid-ta');
    expect(snapshot!.napkins[0].agents[0].started).toBe(true);
    expect(snapshot!.napkins[0].agents[0].running).toBe(false);
    expect(snapshot!.architects[0].id).toBe('uuid-arch');
    expect(snapshot!.architects[0].started).toBe(true);
  });
});

// ── STOP→RUN resume decisions ──

describe('STOP→RUN resume decisions', () => {
  // T-0200-10
  it('Case A — started + not exited → resume', async () => {
    const fs = createSurvivabilityFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);

    const decisions = computeResumeActions(model.getAllAgents());
    const ta = decisions.find((d) => d.agentId === 'uuid-ta');
    expect(ta!.action).toBe('resume');
    expect(ta!.command).toContain('--resume uuid-ta');
  });

  // T-0200-11
  it('Case B — exited → skip', async () => {
    const fs = createSurvivabilityFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);

    const decisions = computeResumeActions(model.getAllAgents());
    const fsEng = decisions.find((d) => d.agentId === 'uuid-fs');
    expect(fsEng!.action).toBe('skip');
  });

  // T-0200-12
  it('Case C — not started → fresh', async () => {
    const fs = createSurvivabilityFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);

    const decisions = computeResumeActions(model.getAllAgents());
    const fresh = decisions.find((d) => d.agentId === 'uuid-fresh');
    expect(fresh!.action).toBe('fresh');
    expect(fresh!.command).toContain('--session-id uuid-fresh');
  });

  // T-0200-13
  it('Architect classified by same A/B/C rules', async () => {
    const fs = createSurvivabilityFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);

    const decisions = computeResumeActions(model.getAllAgents());
    const arch = decisions.find((d) => d.agentId === 'uuid-arch');
    expect(arch!.action).toBe('resume');
    expect(arch!.command).toContain('--resume uuid-arch');
  });

  // T-0200-14
  it('All-exited fixture → every decision is skip', async () => {
    const fs9 = createAllExitedFixture();
    const model9 = createModel(fs9);
    await model9.loadFromFilesystem(NEPIC_DIR);

    const decisions = computeResumeActions(model9.getAllAgents());
    expect(decisions.every((d) => d.action === 'skip')).toBe(true);
  });
});

// ── STOP→RUN with FakePtySpawner ──

describe('STOP→RUN with FakePtySpawner', () => {
  // T-0200-20
  it('Resume spawns pty with --resume flag', async () => {
    const fs = createSurvivabilityFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);
    const ptySpawner = new FakePtySpawner();

    await startAgents(model, ptySpawner);

    const call = ptySpawner.spawned.find((s) => s.id === 'uuid-ta');
    expect(call).toBeDefined();
    expect(call!.command).toContain('claude --verbose --resume uuid-ta');
  });

  // T-0200-21
  it('Fresh start spawns pty with --session-id flag + prompt', async () => {
    const fs = createSurvivabilityFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);
    const ptySpawner = new FakePtySpawner();

    await startAgents(model, ptySpawner);

    const call = ptySpawner.spawned.find((s) => s.id === 'uuid-fresh');
    expect(call).toBeDefined();
    expect(call!.command).toContain('--session-id uuid-fresh');
    expect(call!.command).toContain('read');
  });

  // T-0200-22
  it('Fresh start writes started: true to marker', async () => {
    const fs = createSurvivabilityFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);
    const ptySpawner = new FakePtySpawner();

    await startAgents(model, ptySpawner);

    const marker = (await fs.readJSON(
      'nepic/30-napkins/0200-build/agents/001-fs-eng/.agent.nap.json',
    )) as any;
    expect(marker.started).toBe(true);
  });

  // T-0200-23
  it('Exited agent → no pty spawned', async () => {
    const fs = createSurvivabilityFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);
    const ptySpawner = new FakePtySpawner();

    await startAgents(model, ptySpawner);

    expect(ptySpawner.spawned.find((s) => s.id === 'uuid-fs')).toBeUndefined();
  });

  // T-0200-24
  it('Running flag set after spawn', async () => {
    const fs = createSurvivabilityFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);
    const ptySpawner = new FakePtySpawner();

    await startAgents(model, ptySpawner);

    // Case A: running
    const ta = model.getNapkins()[0].agents.find((a) => a.id === 'uuid-ta');
    expect(ta!.running).toBe(true);

    // Case B: not running (exited)
    const fsEng = model.getNapkins()[0].agents.find((a) => a.id === 'uuid-fs');
    expect(fsEng!.running).toBe(false);

    // Case C: running (fresh start)
    const fresh = model.getNapkins()[1].agents.find((a) => a.id === 'uuid-fresh');
    expect(fresh!.running).toBe(true);
  });
});

// ── RUN→STOP transition ──

describe('RUN→STOP transition', () => {
  // T-0200-30
  it('Quit kills all ptys', async () => {
    const fs = createSurvivabilityFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);
    const ptySpawner = new FakePtySpawner();

    await startAgents(model, ptySpawner);
    expect(ptySpawner.runningCount()).toBe(3); // uuid-ta, uuid-fresh, uuid-arch

    await stopApp(model, ptySpawner);
    expect(ptySpawner.runningCount()).toBe(0);
  });

  // T-0200-31
  it('Quit does NOT write exited flags — markers unchanged', async () => {
    const fs = createSurvivabilityFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);
    const ptySpawner = new FakePtySpawner();

    await startAgents(model, ptySpawner);

    const agentMarkerPath =
      'nepic/30-napkins/0100-explore/agents/001-test-arch/.agent.nap.json';
    const before = await fs.readJSON(agentMarkerPath);

    await stopApp(model, ptySpawner);

    const after = await fs.readJSON(agentMarkerPath);
    expect(after).toEqual(before);
    expect((after as any).exited).toBe(false);
  });

  // T-0200-32
  it('Quit saves UI state', async () => {
    const fs = createSurvivabilityFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);
    const ptySpawner = new FakePtySpawner();

    await startAgents(model, ptySpawner);

    await stopApp(model, ptySpawner, {
      activeNepicId: 'test-nepic',
      activeTerminalId: 'uuid-ta',
      sidebarVisible: true,
    });

    const uiState = (await fs.readJSON('nepic/ui-state.json')) as any;
    expect(uiState).toMatchObject({
      activeNepicId: 'test-nepic',
      activeTerminalId: 'uuid-ta',
    });
  });

  // T-0200-33
  it('Quit → reload → running=false for all agents', async () => {
    const fs = createSurvivabilityFixture();
    const model1 = createModel(fs);
    await model1.loadFromFilesystem(NEPIC_DIR);
    const ptySpawner = new FakePtySpawner();

    await startAgents(model1, ptySpawner);
    expect(model1.getNapkins()[0].agents[0].running).toBe(true);

    await stopApp(model1, ptySpawner);

    const model2 = createModel(fs);
    await model2.loadFromFilesystem(NEPIC_DIR);
    expect(model2.getNapkins()[0].agents[0].running).toBe(false);
  });

  // T-0200-34
  it('Pty exit during kill → exited NOT written', async () => {
    const fs = createSurvivabilityFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);
    const ptySpawner = new FakePtySpawner();

    await startAgents(model, ptySpawner);

    // Record all marker writes
    const writesSpy = vi.spyOn(fs, 'writeJSON');

    await stopApp(model, ptySpawner);

    // Only write should be ui-state.json (if any), NOT any .agent.nap.json
    const agentWrites = writesSpy.mock.calls.filter((c) =>
      (c[0] as string).includes('.agent.nap.json'),
    );
    expect(agentWrites).toHaveLength(0);
  });
});

// ── Runtime: agent exits on its own ──

describe('Runtime: agent exits on its own', () => {
  // T-0200-40
  it('Agent pty exits → model marks exited + marker updated', async () => {
    const fs = createSurvivabilityFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);
    const ptySpawner = new FakePtySpawner();

    await startAgents(model, ptySpawner);
    await ptySpawner.simulateExit('uuid-ta', 0);

    const agent = model.getNapkins()[0].agents.find((a) => a.id === 'uuid-ta');
    expect(agent!.exited).toBe(true);
    expect(agent!.running).toBe(false);

    const agentMarkerPath =
      'nepic/30-napkins/0100-explore/agents/001-test-arch/.agent.nap.json';
    const marker = (await fs.readJSON(agentMarkerPath)) as any;
    expect(marker.exited).toBe(true);
    expect(marker.cc_session_uuid).toBe('uuid-ta'); // other fields preserved
  });

  // T-0200-41
  it('Exited agent NOT resumed on next start', async () => {
    const fs = createSurvivabilityFixture();

    // Phase 1: agent exits during operation
    const model1 = createModel(fs);
    await model1.loadFromFilesystem(NEPIC_DIR);
    const pty1 = new FakePtySpawner();
    await startAgents(model1, pty1);
    await pty1.simulateExit('uuid-ta', 0);
    await stopApp(model1, pty1);

    // Phase 2: restart
    const model2 = createModel(fs);
    await model2.loadFromFilesystem(NEPIC_DIR);
    const pty2 = new FakePtySpawner();
    await startAgents(model2, pty2);

    expect(pty2.spawned.find((s) => s.id === 'uuid-ta')).toBeUndefined();
  });

  // T-0200-42
  it('Agent exit fires bridge notification', async () => {
    const fs = createSurvivabilityFixture();
    const model = createModel(fs);
    const bridge = new FakeBridge();
    wireModelToBridge(model, bridge, 'test-nepic');

    let snapshot: AppSnapshot | null = null;
    bridge.onSnapshot((s) => (snapshot = s));

    await model.loadFromFilesystem(NEPIC_DIR);
    const ptySpawner = new FakePtySpawner();
    await startAgents(model, ptySpawner);
    await ptySpawner.simulateExit('uuid-ta', 0);

    const agent = snapshot!.napkins[0].agents.find((a) => a.id === 'uuid-ta');
    expect(agent!.exited).toBe(true);
    expect(agent!.running).toBe(false);
  });
});

// ── Done signal ──

describe('Done signal', () => {
  // T-0200-43
  it('Done signal → done=true, running still true', async () => {
    const fs = createSurvivabilityFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);
    const ptySpawner = new FakePtySpawner();

    await startAgents(model, ptySpawner);
    model.setAgentDone('uuid-ta');

    const agent = model.getNapkins()[0].agents.find((a) => a.id === 'uuid-ta');
    expect(agent!.done).toBe(true);
    expect(agent!.running).toBe(true);
  });

  // T-0200-44
  it('Done IS persisted → reload → done=true', async () => {
    const fs = createSurvivabilityFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);
    const ptySpawner = new FakePtySpawner();

    await startAgents(model, ptySpawner);
    await model.setAgentDone('uuid-ta');
    await stopApp(model, ptySpawner);

    const model2 = createModel(fs);
    await model2.loadFromFilesystem(NEPIC_DIR);
    const agent = model2.getNapkins()[0].agents.find((a) => a.id === 'uuid-ta');
    expect(agent!.done).toBe(true);
  });

  // T-0200-45
  it('Done agent is resumed on restart (done ≠ exited)', async () => {
    const fs = createSurvivabilityFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);
    const ptySpawner = new FakePtySpawner();

    await startAgents(model, ptySpawner);
    await model.setAgentDone('uuid-ta');
    await stopApp(model, ptySpawner);

    const model2 = createModel(fs);
    await model2.loadFromFilesystem(NEPIC_DIR);
    const pty2 = new FakePtySpawner();
    await startAgents(model2, pty2);

    const call = pty2.spawned.find((s) => s.id === 'uuid-ta');
    expect(call).toBeDefined();
    expect(call!.command).toContain('--resume uuid-ta');
  });

  // T-0200-46
  it('Done signal fires bridge notification', async () => {
    const fs = createSurvivabilityFixture();
    const model = createModel(fs);
    const bridge = new FakeBridge();
    wireModelToBridge(model, bridge, 'test-nepic');

    let snapshot: AppSnapshot | null = null;
    bridge.onSnapshot((s) => (snapshot = s));

    await model.loadFromFilesystem(NEPIC_DIR);
    const ptySpawner = new FakePtySpawner();
    await startAgents(model, ptySpawner);
    model.setAgentDone('uuid-ta');

    const agent = snapshot!.napkins[0].agents.find((a) => a.id === 'uuid-ta');
    expect(agent!.done).toBe(true);
    expect(agent!.running).toBe(true);
  });
});

// ── Survivability journeys ──

describe('Survivability journeys', () => {
  // T-0200-50
  it('Journey — start → agent exits → quit → restart → correct agents resume', async () => {
    const fs = createSurvivabilityFixture();

    // Phase 1: start, agent exits
    const model1 = createModel(fs);
    await model1.loadFromFilesystem(NEPIC_DIR);
    const pty1 = new FakePtySpawner();
    await startAgents(model1, pty1);
    await pty1.simulateExit('uuid-ta', 0);
    await stopApp(model1, pty1);

    // Phase 2: restart
    const model2 = createModel(fs);
    await model2.loadFromFilesystem(NEPIC_DIR);
    const pty2 = new FakePtySpawner();
    await startAgents(model2, pty2);

    // uuid-ta: exited → skipped
    expect(pty2.spawned.find((s) => s.id === 'uuid-ta')).toBeUndefined();

    // uuid-arch: Case A → resumed
    const archCall = pty2.spawned.find((s) => s.id === 'uuid-arch');
    expect(archCall).toBeDefined();
    expect(archCall!.command).toContain('--resume');

    // uuid-fresh: was Case C in phase 1, now Case A (started=true written)
    const freshCall = pty2.spawned.find((s) => s.id === 'uuid-fresh');
    expect(freshCall).toBeDefined();
    expect(freshCall!.command).toContain('--resume uuid-fresh');
  });

  // T-0200-51
  it('Journey — fresh agent → started=true → quit → restart → now resumes', async () => {
    const fs = createSurvivabilityFixture();
    const freshMarkerPath =
      'nepic/30-napkins/0200-build/agents/001-fs-eng/.agent.nap.json';

    // Phase 1: fresh start writes started=true
    const model1 = createModel(fs);
    await model1.loadFromFilesystem(NEPIC_DIR);
    const pty1 = new FakePtySpawner();
    await startAgents(model1, pty1);
    const marker1 = (await fs.readJSON(freshMarkerPath)) as any;
    expect(marker1.started).toBe(true);
    await stopApp(model1, pty1);

    // Phase 2: now Case A
    const model2 = createModel(fs);
    await model2.loadFromFilesystem(NEPIC_DIR);
    const pty2 = new FakePtySpawner();
    await startAgents(model2, pty2);

    const call = pty2.spawned.find((s) => s.id === 'uuid-fresh');
    expect(call!.command).toContain('--resume uuid-fresh'); // Case A, not C
  });

  // T-0200-52
  it('Journey — full cycle with bridge: start → done → quit → restart → snapshot correct', async () => {
    const fs = createSurvivabilityFixture();

    // Phase 1: runtime events
    const model1 = createModel(fs);
    const bridge1 = new FakeBridge();
    wireModelToBridge(model1, bridge1, 'test-nepic');
    await model1.loadFromFilesystem(NEPIC_DIR);
    const pty1 = new FakePtySpawner();
    await startAgents(model1, pty1);
    await model1.setAgentDone('uuid-ta');
    await stopApp(model1, pty1);

    // Phase 2: restart with bridge
    const model2 = createModel(fs);
    const bridge2 = new FakeBridge();
    wireModelToBridge(model2, bridge2, 'test-nepic');
    let snapshot: AppSnapshot | null = null;
    bridge2.onSnapshot((s) => (snapshot = s));

    await model2.loadFromFilesystem(NEPIC_DIR);

    // uuid-ta: done persisted, not exited, not running
    const ta = snapshot!.napkins[0].agents.find((a) => a.id === 'uuid-ta');
    expect(ta!.done).toBe(true);
    expect(ta!.exited).toBe(false);
    expect(ta!.running).toBe(false);

    // uuid-fs: still exited from fixture
    const fsEng = snapshot!.napkins[0].agents.find((a) => a.id === 'uuid-fs');
    expect(fsEng!.exited).toBe(true);
  });
});
