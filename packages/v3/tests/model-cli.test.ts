import { describe, it, expect, vi } from 'vitest';
import { createModel } from '../src/main/model';
import { FakePtySpawner } from '../src/main/pty-spawner';
import {
  createCliIntegrationFixture,
  createEmptyNepicFixture,
  NEPIC_DIR,
} from './fixtures';

describe('NapModel — new CLI methods', () => {
  // T-0210-20
  it('createNapkin writes dir + .napkin.nap.json', async () => {
    const fs = createEmptyNepicFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);

    const spy = vi.fn();
    model.onChange(spy);
    const napkin = await model.createNapkin('0100-feature', 'backlog');

    expect(napkin.slug).toBe('0100-feature');
    expect(napkin.status).toBe('backlog');

    const marker = await fs.readJSON('nepic/30-napkins/0100-feature/.napkin.nap.json') as Record<string, unknown>;
    expect(marker['status']).toBe('backlog');

    expect(model.getNapkins().length).toBeGreaterThanOrEqual(1);
    expect(spy).toHaveBeenCalled();
  });

  // T-0210-21
  it('createNapkin returns JSON matching CLI design', async () => {
    const fs = createEmptyNepicFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);

    const result = await model.createNapkin('0100-feature', 'backlog');
    expect(result).toMatchObject({ slug: '0100-feature', status: 'backlog' });
    expect(result.dir).toContain('30-napkins/0100-feature');
    expect(result.nepic).toBeDefined();
  });

  // T-0210-22
  it('createAgentStub writes marker, does NOT spawn pty', async () => {
    const fs = createCliIntegrationFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);

    const agent = await model.createAgentStub('0100-explore', '003-test-eng', 'test-eng');
    expect(agent.name).toBe('003-test-eng');

    // Check model state
    const allAgents = model.getAllAgents();
    const found = allAgents.find(a => a.name === '003-test-eng');
    expect(found).toBeDefined();
    expect(found!.started).toBe(false);
    expect(found!.running).toBe(false);

    // Check marker
    const marker = await fs.readJSON('nepic/30-napkins/0100-explore/agents/003-test-eng/.agent.nap.json') as Record<string, unknown>;
    expect(marker['role']).toBe('test-eng');
    expect(marker['started']).toBe(false);
    expect(marker['cc_session_uuid']).toBeDefined();
  });

  // T-0210-23
  it('createAgentStub returns JSON matching CLI design', async () => {
    const fs = createCliIntegrationFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);

    const result = await model.createAgentStub('0100-explore', '003-test-eng', 'test-eng');
    expect(result).toMatchObject({ name: '003-test-eng', role: 'test-eng', napkin: '0100-explore' });
    expect(result.id).toBeDefined();
    expect(result.dir).toContain('agents/003-test-eng');
    expect(result.nepic).toBeDefined();
  });

  // T-0210-24
  it('createArchitectStub writes to 20-architects/', async () => {
    const fs = createEmptyNepicFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);

    const arch = await model.createArchitectStub('002-nova');
    expect(arch.role).toBe('architect');
    expect(arch.name).toBe('002-nova');
    expect(arch.dir).toContain('20-architects/002-nova');

    const marker = await fs.readJSON('nepic/20-architects/002-nova/.agent.nap.json') as Record<string, unknown>;
    expect(marker['role']).toBe('architect');
    expect(marker['started']).toBe(false);
  });

  // T-0210-25
  it('createNepic scaffolds full structure + architect stub', async () => {
    const fs = createEmptyNepicFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);

    const nepic = await model.createNepic('02-v2', 'Version 2');
    expect(nepic.slug).toBe('02-v2');
    expect(nepic.name).toBe('Version 2');
    expect(nepic.architectId).toBeDefined();
    expect(nepic.architectDir).toContain('20-architects/001-architect');

    const archMarker = await fs.readJSON(nepic.architectDir + '/.agent.nap.json') as Record<string, unknown>;
    expect(archMarker['role']).toBe('architect');
  });

  // T-0210-26
  it('startAgentByName finds agent, spawns pty, sets started+running', async () => {
    const fs = createCliIntegrationFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);

    const ptySpawner = new FakePtySpawner();
    const agent = await model.startAgentByName('001-fs-eng', 'read prompt.md', ptySpawner);

    expect(agent.id).toBe('uuid-fresh');
    expect(ptySpawner.spawned).toHaveLength(1);
    expect(ptySpawner.spawned[0].id).toBe('uuid-fresh');
    expect(ptySpawner.spawned[0].command).toContain('claude --verbose');
    expect(ptySpawner.spawned[0].command).toContain('read prompt.md');

    // Check model state
    const found = model.getAllAgents().find(a => a.id === 'uuid-fresh');
    expect(found!.started).toBe(true);
    expect(found!.running).toBe(true);

    const marker = await fs.readJSON('nepic/30-napkins/0200-build/agents/001-fs-eng/.agent.nap.json') as Record<string, unknown>;
    expect(marker['started']).toBe(true);
  });

  // T-0210-27
  it('startAgentByName on already-running agent → error', async () => {
    const fs = createCliIntegrationFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);

    // Mark 001-test-arch as running (it has started=true in fixture but running is in-memory)
    model.setAgentRunning('uuid-ta', true);

    const ptySpawner = new FakePtySpawner();
    await expect(
      model.startAgentByName('001-test-arch', null, ptySpawner),
    ).rejects.toThrow(/already running/);
    expect(ptySpawner.spawned).toHaveLength(0);
  });

  // T-0210-28
  it('startAgentByName on nonexistent agent → error with suggestions', async () => {
    const fs = createCliIntegrationFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);

    const ptySpawner = new FakePtySpawner();
    await expect(
      model.startAgentByName('test-arch', null, ptySpawner),
    ).rejects.toThrow(/no agent named/);
  });

  // T-0210-14 (from name resolution tests)
  it('createAgentStub rejects duplicate name within napkin', async () => {
    const fs = createCliIntegrationFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);

    await expect(
      model.createAgentStub('0100-explore', '001-test-arch', 'test-arch'),
    ).rejects.toThrow(/already exists/);
  });

  // T-0210-29
  it('getStatus returns correct data for different query types', async () => {
    const fs = createCliIntegrationFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);

    // Napkin query
    const napkinStatus = model.getStatus({ napkin: '0100-explore' });
    expect(napkinStatus.phase).toBe('doing');
    expect(napkinStatus.agentCount).toBe(2);

    // Agent query
    const agentStatus = model.getStatus({ agent: '001-test-arch' });
    expect(agentStatus.role).toBe('test-arch');
    expect(agentStatus.started).toBe(true);

    // Overview
    const overview = model.getStatus({});
    expect(overview.napkinsByPhase!['doing']).toBe(1);
    expect(overview.napkinsByPhase!['backlog']).toBe(1);
  });

  // T-0210-30
  it('getAllAgentsTree returns agents grouped by parent', async () => {
    const fs = createCliIntegrationFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);

    const tree = model.getAllAgentsTree();
    const archNode = tree.find(n => n.name === '001-architect');
    expect(archNode).toBeDefined();
    expect(archNode!.children).toHaveLength(1);
    expect(archNode!.children[0].name).toBe('001-test-arch');
    expect(archNode!.children[0].children[0].name).toBe('002-fs-eng');

    const freshNode = tree.find(n => n.name === '001-fs-eng');
    expect(freshNode).toBeDefined();
    expect(freshNode!.children).toHaveLength(0);
  });
});
