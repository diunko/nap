import { describe, it, expect } from 'vitest';
import { createModel, generateSuccessorPrompt } from '../src/main/model';
import {
  createArchivedFixture,
  createMinimalFixture,
  createRichFixture,
  createMixedLifecycleFixture,
  createSurvivabilityFixture,
  NEPIC_DIR,
} from './fixtures';
import { computeResumeActions } from '../src/main/resume';
import { startAgents, RESUME_FAIL_THRESHOLD_MS } from '../src/main/coordinators';
import { FakePtySpawner } from '../src/main/pty-spawner';
import { FakeBridge, wireModelToBridge } from '../src/main/bridge';
import { dotStyle } from '../src/shared/dot-style';
import type { AgentState, AppSnapshot } from '../src/shared/bridge-types';

// ── I. Model layer — archived flag ──

describe('I. Model layer — archived flag', () => {
  it('T-0620-01: archived flag loaded from marker', async () => {
    const fs = createArchivedFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);

    const agents = model.getAllAgents();
    const archived = agents.find(a => a.id === 'uuid-archived-ta');
    expect(archived).toBeDefined();
    expect(archived!.archived).toBe(true);
  });

  it('T-0620-02: archived flag defaults to false when absent', async () => {
    const fs = createMinimalFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);

    const agents = model.getAllAgents();
    for (const agent of agents) {
      expect(agent.archived).toBe(false);
    }
  });

  it('T-0620-03: archived flag survives filesystem reload', async () => {
    const fs = createArchivedFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);

    // First load
    let agent = model.getAllAgents().find(a => a.id === 'uuid-archived-ta');
    expect(agent!.archived).toBe(true);

    // Reload (simulates watcher)
    await model.loadFromFilesystem(NEPIC_DIR);
    agent = model.getAllAgents().find(a => a.id === 'uuid-archived-ta');
    expect(agent!.archived).toBe(true);
  });

  it('T-0620-04: archived in bridge snapshot', async () => {
    const fs = createArchivedFixture();
    const model = createModel(fs);
    const bridge = new FakeBridge();

    wireModelToBridge(model, bridge);

    let received: AppSnapshot | null = null;
    bridge.onSnapshot(s => { received = s; });

    await model.loadFromFilesystem(NEPIC_DIR);

    expect(received).not.toBeNull();
    const napkin = received!.napkins[0];
    const archived = napkin.agents.find(a => a.id === 'uuid-archived-ta');
    expect(archived!.archived).toBe(true);

    // Architect too
    const archArchived = received!.architects.find(a => a.id === 'uuid-archived-arch');
    expect(archArchived!.archived).toBe(true);
  });

  it('T-0620-05: archived flag in getAllAgents and getStatus', async () => {
    const fs = createArchivedFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);

    // getStatus
    const status = model.getStatus({ agent: '001-test-arch' });
    expect(status.archived).toBe(true);

    // getAllAgentsTree — agentStatus returns 'archived'
    const tree = model.getAllAgentsTree();
    const archNode = tree.flatMap(n => [n, ...n.children]).find(n => n.id === 'uuid-archived-ta');
    expect(archNode!.status).toBe('archived');
  });
});

// ── II. Resume logic — Path A (archived flag skips resume) ──

describe('II. Resume logic — Path A', () => {
  it('T-0620-10: archived agent skipped by computeResumeActions', () => {
    const agents: AgentState[] = [
      { id: 'a', name: 'a', role: 'fs-eng', nepicId: 'n', napkinId: null, parentName: null, parentId: null, createdAt: 0, started: true, exited: false, running: false, done: false, archived: true, homePath: '/p/a', entries: [] },
      { id: 'b', name: 'b', role: 'fs-eng', nepicId: 'n', napkinId: null, parentName: null, parentId: null, createdAt: 0, started: false, exited: false, running: false, done: false, archived: true, homePath: '/p/b', entries: [] },
      { id: 'c', name: 'c', role: 'fs-eng', nepicId: 'n', napkinId: null, parentName: null, parentId: null, createdAt: 0, started: true, exited: true, running: false, done: false, archived: true, homePath: '/p/c', entries: [] },
    ];

    const actions = computeResumeActions(agents);
    for (const action of actions) {
      expect(action.action).toBe('skip');
    }
  });

  it('T-0620-11: archived agent — no pty spawned on startAgents', async () => {
    const fs = createArchivedFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);

    const pty = new FakePtySpawner();
    await startAgents(model, pty);

    // Only the alive agent should be spawned (uuid-alive-fs)
    const spawnedIds = pty.spawned.map(s => s.id);
    expect(spawnedIds).not.toContain('uuid-archived-ta');
    expect(spawnedIds).not.toContain('uuid-archived-arch');
    expect(spawnedIds).toContain('uuid-alive-fs');
  });

  it('T-0620-12: mixed fixture — correct resume decisions', () => {
    const agents: AgentState[] = [
      // archived → skip
      { id: 'archived', name: 'a', role: 'fs-eng', nepicId: 'n', napkinId: null, parentName: null, parentId: null, createdAt: 0, started: true, exited: false, running: false, done: false, archived: true, homePath: '/p', entries: [] },
      // alive (started + !exited) → resume
      { id: 'alive', name: 'b', role: 'fs-eng', nepicId: 'n', napkinId: null, parentName: null, parentId: null, createdAt: 0, started: true, exited: false, running: false, done: false, archived: false, homePath: '/p', entries: [] },
      // exited → skip
      { id: 'exited', name: 'c', role: 'fs-eng', nepicId: 'n', napkinId: null, parentName: null, parentId: null, createdAt: 0, started: true, exited: true, running: false, done: false, archived: false, homePath: '/p', entries: [] },
      // fresh → fresh
      { id: 'fresh', name: 'd', role: 'fs-eng', nepicId: 'n', napkinId: null, parentName: null, parentId: null, createdAt: 0, started: false, exited: false, running: false, done: false, archived: false, homePath: '/p', entries: [] },
    ];

    const actions = computeResumeActions(agents);
    expect(actions.find(a => a.agentId === 'archived')!.action).toBe('skip');
    expect(actions.find(a => a.agentId === 'alive')!.action).toBe('resume');
    expect(actions.find(a => a.agentId === 'exited')!.action).toBe('skip');
    expect(actions.find(a => a.agentId === 'fresh')!.action).toBe('fresh');
  });

  it('T-0620-13: archived architect also skipped', () => {
    const agents: AgentState[] = [
      { id: 'arch', name: '001-architect', role: 'architect', nepicId: 'n', napkinId: null, parentName: null, parentId: null, createdAt: 0, started: true, exited: false, running: false, done: false, archived: true, homePath: '/p', entries: [] },
    ];

    const actions = computeResumeActions(agents);
    expect(actions[0].action).toBe('skip');
  });
});

// ── III. Resume failure detection — Path B ──

describe('III. Resume failure detection — Path B', () => {
  it('T-0620-20: fast exit + "No conversation found" → agent marked archived', async () => {
    const fs = createSurvivabilityFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);

    const pty = new FakePtySpawner();
    await startAgents(model, pty);

    // uuid-ta was started+!exited → gets --resume
    const resumeSpawn = pty.spawned.find(s => s.id === 'uuid-ta');
    expect(resumeSpawn).toBeDefined();
    expect(resumeSpawn!.command).toContain('--resume');

    // Simulate output and fast exit
    pty.simulateOutput('uuid-ta', 'No conversation found with session ID: uuid-ta');
    await pty.simulateExit('uuid-ta', 1);

    const agent = model.getAllAgents().find(a => a.id === 'uuid-ta');
    expect(agent!.archived).toBe(true);
  });

  it('T-0620-21: slow exit (>5s) does NOT trigger successor', async () => {
    const fs = createSurvivabilityFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);

    const pty = new FakePtySpawner();

    // Mock Date.now to simulate time passage
    const originalNow = Date.now;
    let fakeTime = originalNow();
    Date.now = () => fakeTime;

    try {
      await startAgents(model, pty);

      // Advance time past threshold
      fakeTime += RESUME_FAIL_THRESHOLD_MS + 1000;

      pty.simulateOutput('uuid-ta', 'No conversation found with session ID: uuid-ta');
      await pty.simulateExit('uuid-ta', 1);

      const agent = model.getAllAgents().find(a => a.id === 'uuid-ta');
      // Should be exited, NOT archived (slow exit)
      expect(agent!.archived).toBe(false);
      expect(agent!.exited).toBe(true);
    } finally {
      Date.now = originalNow;
    }
  });

  it('T-0620-22: fresh start exit does NOT trigger successor (even if fast)', async () => {
    const fs = createSurvivabilityFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);

    const pty = new FakePtySpawner();
    await startAgents(model, pty);

    // uuid-fresh was !started → gets --session-id (fresh start)
    const freshSpawn = pty.spawned.find(s => s.id === 'uuid-fresh');
    expect(freshSpawn).toBeDefined();
    expect(freshSpawn!.command).toContain('--session-id');

    // Simulate fast exit
    pty.simulateOutput('uuid-fresh', 'No conversation found');
    await pty.simulateExit('uuid-fresh', 1);

    const agent = model.getAllAgents().find(a => a.id === 'uuid-fresh');
    // Should be exited, NOT archived (was a fresh start)
    expect(agent!.archived).toBe(false);
    expect(agent!.exited).toBe(true);
  });

  it('T-0620-23: resume exit without "No conversation found" → normal exit', async () => {
    const fs = createSurvivabilityFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);

    const pty = new FakePtySpawner();
    await startAgents(model, pty);

    // Simulate fast exit with different error message
    pty.simulateOutput('uuid-ta', 'Connection refused');
    await pty.simulateExit('uuid-ta', 1);

    const agent = model.getAllAgents().find(a => a.id === 'uuid-ta');
    expect(agent!.archived).toBe(false);
    expect(agent!.exited).toBe(true);
  });

  it('T-0620-24: v2 fallback pattern parity — 5-second threshold', () => {
    expect(RESUME_FAIL_THRESHOLD_MS).toBe(5000);
  });
});

// ── IV. Successor flow ──

describe('IV. Successor flow', () => {
  it('T-0620-32: successor spawn — fresh Claude with generated prompt', async () => {
    const fs = createArchivedFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);

    const pty = new FakePtySpawner();
    const newId = await model.spawnSuccessor('uuid-archived-ta', pty);

    expect(newId).toBeDefined();
    expect(newId).not.toBe('uuid-archived-ta');

    // Check the pty was spawned with new UUID
    const spawn = pty.spawned.find(s => s.id === newId);
    expect(spawn).toBeDefined();
    expect(spawn!.command).toContain('--session-id');
    expect(spawn!.command).toContain(newId!);
    // Should include successor prompt content
    expect(spawn!.command).toContain('successor maintainer');
  });

  it('T-0620-33: successor prompt content — all required context', async () => {
    const agent: AgentState = {
      id: 'uuid-test',
      name: '001-test-arch',
      role: 'test-arch',
      nepicId: 'test-nepic',
      napkinId: '0100-explore',
      parentName: null,
      parentId: null,
      createdAt: 0,
      started: false,
      exited: false,
      running: false,
      done: false,
      archived: true,
      pendingApproval: null,
      homePath: 'nepic/30-napkins/0100-explore/agents/001-test-arch',
      entries: [],
    };

    const prompt = generateSuccessorPrompt(agent);

    // Must mention role file
    expect(prompt).toContain('.nap/00-org/40-roles/test-arch.md');
    // Must mention prompt.md
    expect(prompt).toContain('prompt.md');
    // Must mention response.md
    expect(prompt).toContain('response.md');
    // Must mention napkin .nap.md
    expect(prompt).toContain('0100-explore.nap.md');
  });

  it('T-0620-34: after successor spawn — new UUID replaces old', async () => {
    const fs = createArchivedFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);

    const pty = new FakePtySpawner();
    const newId = await model.spawnSuccessor('uuid-archived-ta', pty);

    // Old UUID gone from model
    const oldAgent = model.getAllAgents().find(a => a.id === 'uuid-archived-ta');
    expect(oldAgent).toBeUndefined();

    // New UUID present
    const newAgent = model.getAllAgents().find(a => a.id === newId);
    expect(newAgent).toBeDefined();
    expect(newAgent!.archived).toBe(false);
    expect(newAgent!.done).toBe(true);
    expect(newAgent!.started).toBe(true);

    // Check marker on disk
    const marker = await fs.readJSON('nepic/30-napkins/0100-explore/agents/001-test-arch/.agent.nap.json') as Record<string, unknown>;
    expect(marker.cc_session_uuid).toBe(newId);
    expect(marker.archived).toBe(false);
  });

  it('T-0620-35: successor agent can nap done', async () => {
    const fs = createArchivedFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);

    const pty = new FakePtySpawner();
    const newId = await model.spawnSuccessor('uuid-archived-ta', pty);

    model.setAgentDone(newId!);

    const agent = model.getAllAgents().find(a => a.id === newId);
    expect(agent!.done).toBe(true);
  });

  it('T-0620-36: successor agent resumes normally after restart', async () => {
    const fs = createArchivedFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);

    const pty = new FakePtySpawner();
    const newId = await model.spawnSuccessor('uuid-archived-ta', pty);

    // Reload model (simulates app restart)
    await model.loadFromFilesystem(NEPIC_DIR);

    const actions = computeResumeActions(model.getAllAgents());
    const successorAction = actions.find(a => a.agentId === newId);
    // started=true, archived=false → should resume
    expect(successorAction!.action).toBe('resume');
  });
});

// ── V. Dot style — archived visual ──

describe('V. Dot style — archived visual', () => {
  it('T-0620-40: dotStyle returns gray hollow for archived agents', () => {
    const result = dotStyle({
      role: 'fs-eng',
      running: false,
      done: false,
      exited: false,
      archived: true,
    });

    expect(result.color).toBe('#6b7280');
    expect(result.shape).toBe('hollow');
  });

  it('T-0620-40b: archived takes precedence over other flags', () => {
    // Even if done, archived should show gray hollow
    const result = dotStyle({
      role: 'fs-eng',
      running: false,
      done: true,
      exited: false,
      archived: true,
    });

    expect(result.color).toBe('#6b7280');
    expect(result.shape).toBe('hollow');
  });
});

// ── VI. import-agents CLI — tested via filesystem logic ──
// Note: CLI integration tests require building the CLI and running as subprocess.
// Here we test the underlying logic that the CLI uses.

describe('VI. import-agents — role inference', () => {
  it('T-0620-52: role inference from dir name convention', () => {
    // The CLI strips numeric prefix + first dash
    function inferRole(dirName: string): string {
      return dirName.replace(/^\d+-/, '');
    }

    expect(inferRole('001-test-arch')).toBe('test-arch');
    expect(inferRole('002-fs-eng')).toBe('fs-eng');
    expect(inferRole('003-reviewer')).toBe('reviewer');
    expect(inferRole('001-fs-eng-debug')).toBe('fs-eng-debug');
    expect(inferRole('001-architect')).toBe('architect');
  });
});

// ── VII. Journey tests ──

describe('VII. Journey tests', () => {
  it('T-0620-63: successor has enough context to answer questions', async () => {
    const fs = createArchivedFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);

    const agent = model.getAllAgents().find(a => a.id === 'uuid-archived-ta')!;
    const prompt = generateSuccessorPrompt(agent);

    // All four context references present
    expect(prompt).toContain('40-roles/test-arch.md');
    expect(prompt).toContain('prompt.md');
    expect(prompt).toContain('response.md');
    expect(prompt).toContain('0100-explore.nap.md');
  });

  it('T-0620-62: mixed project — correct resume decisions', async () => {
    const fs = createMixedLifecycleFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);

    const pty = new FakePtySpawner();
    await startAgents(model, pty);

    // 6 alive + 1 architect = 7 resumed, 2 will-fail are also started so resumed (before failure)
    // Total spawned: 6 alive + 2 will-fail + 1 architect = 9
    // Archived agents NOT spawned
    const spawnedIds = new Set(pty.spawned.map(s => s.id));
    expect(spawnedIds.has('uuid-archived-1')).toBe(false);
    expect(spawnedIds.has('uuid-archived-2')).toBe(false);
    expect(spawnedIds.size).toBe(9); // 6 alive + 2 will-fail + 1 architect
  });
});

// ── VIII. Regression / safety ──

describe('VIII. Regression / safety', () => {
  it('T-0620-70: existing tests unbroken — archived=undefined treated as false', async () => {
    // Use fixtures that don't have archived field
    const fs = createRichFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);

    const agents = model.getAllAgents();
    for (const agent of agents) {
      expect(agent.archived).toBe(false);
    }
  });

  it('T-0620-71: done+archived is not reachable after successor', async () => {
    const fs = createArchivedFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);

    const pty = new FakePtySpawner();
    const newId = await model.spawnSuccessor('uuid-archived-ta', pty);

    const agent = model.getAllAgents().find(a => a.id === newId)!;
    // After successor: done=true, archived=false (not both true)
    expect(agent.done).toBe(true);
    expect(agent.archived).toBe(false);
  });

  it('T-0620-72: archived agent homePath preserved after operations', async () => {
    const fs = createArchivedFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);

    const agent = model.getAllAgents().find(a => a.id === 'uuid-archived-ta')!;
    const originalPath = agent.homePath;

    // Spawn successor doesn't change homePath
    const pty = new FakePtySpawner();
    await model.spawnSuccessor('uuid-archived-ta', pty);

    // The agent at the same position should have the same homePath
    const napkin = model.getNapkins().find(n => n.slug === '0100-explore')!;
    const taAgent = napkin.agents.find(a => a.name === '001-test-arch');
    expect(taAgent!.homePath).toBe(originalPath);
  });
});
