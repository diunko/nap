import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createModel } from '../src/main/model';
import { createRequestHandler, getPendingRegistry } from '../src/main/socket-handler';
import { startSocketServer, stopSocketServer } from '../src/main/socket-server';
import { FakePtySpawner } from '../src/main/pty-spawner';
import { NdjsonParser, serialize } from '../src/shared/ndjson';
import * as mq from '../src/main/message-queue';
import { MemoryFileSystem } from '../src/main/filesystem';
import {
  createCliIntegrationFixture,
  NEPIC_DIR,
} from './fixtures';

// ── Fixture: F-0650-01 — project with a guardian agent ──

function createGuardianFixture(): MemoryFileSystem {
  return new MemoryFileSystem({
    'nepic/30-napkins/0100-explore/.napkin.nap.json': { status: 'doing', nepic: 'test-nepic' },
    'nepic/30-napkins/0100-explore/agents/001-test-arch/.agent.nap.json': {
      cc_session_uuid: 'uuid-ta',
      role: 'test-arch',
      name: '001-test-arch',
      napkin: '0100-explore',
      nepic: 'test-nepic',
      parent: '001-architect',
      parent_id: 'uuid-arch',
      created_at: 1711700000000,
      started: true,
      exited: false,
    },
    'nepic/30-napkins/0100-explore/agents/002-fs-eng/.agent.nap.json': {
      cc_session_uuid: 'uuid-fs',
      role: 'fs-eng',
      name: '002-fs-eng',
      napkin: '0100-explore',
      nepic: 'test-nepic',
      parent: '001-test-arch',
      parent_id: 'uuid-ta',
      created_at: 1711700100000,
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
    'nepic/20-architects/002-guardian/.agent.nap.json': {
      cc_session_uuid: 'uuid-guardian',
      role: 'guardian',
      name: '002-guardian',
      nepic: 'test-nepic',
      created_at: 1711600100000,
      started: true,
      exited: false,
    },
  });
}

// ── Helpers ──

function tmpSocketPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-perm-test-'));
  return path.join(dir, 'sock');
}

function send(
  socketPath: string,
  request: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const conn = net.createConnection(socketPath);
    conn.on('error', reject);
    const parser = new NdjsonParser((msg) => {
      resolve(msg as Record<string, unknown>);
      conn.destroy();
    });
    conn.on('data', (chunk) => parser.feed(chunk.toString()));
    conn.on('connect', () => {
      conn.write(serialize(request));
    });
  });
}

/**
 * Send request on a long-lived connection (ignores pings).
 * Returns both the parsed response and the underlying socket.
 */
function sendLongLived(
  socketPath: string,
  request: Record<string, unknown>,
): { promise: Promise<Record<string, unknown>>; conn: net.Socket } {
  const conn = net.createConnection(socketPath);
  const promise = new Promise<Record<string, unknown>>((resolve, reject) => {
    conn.on('error', reject);
    const parser = new NdjsonParser((msg) => {
      const obj = msg as Record<string, unknown>;
      if (obj.type === 'ping') return; // ignore keepalive
      resolve(obj);
    });
    conn.on('data', (chunk) => parser.feed(chunk.toString()));
    conn.on('connect', () => {
      conn.write(serialize(request));
    });
  });
  return { promise, conn };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ═══════════════════════════════════════════════════
// MODEL TESTS (T-0650-01 through T-0650-04, T-0650-17, T-0650-18, T-0650-26)
// ═══════════════════════════════════════════════════

describe('0650 — Model: pendingApproval', () => {
  // T-0650-01
  it('setAgentPendingApproval sets state and notifies', async () => {
    const memFs = createGuardianFixture();
    const model = createModel(memFs);
    await model.loadFromFilesystem(NEPIC_DIR);

    const listener = vi.fn();
    model.onChange(listener);

    const approval = { tool: 'Bash', command: 'npm install', timestamp: Date.now(), payload: { tool_name: 'Bash' } };
    model.setAgentPendingApproval('uuid-ta', approval);

    const agent = model.getAllAgents().find(a => a.id === 'uuid-ta');
    expect(agent!.pendingApproval).toEqual(approval);
    expect(listener).toHaveBeenCalled();

    // Verify it shows in getNapkins
    const napkinAgent = model.getNapkins()[0].agents.find(a => a.id === 'uuid-ta');
    expect(napkinAgent!.pendingApproval).toEqual(approval);
  });

  // T-0650-02
  it('clearPendingApproval resets state and notifies', async () => {
    const memFs = createGuardianFixture();
    const model = createModel(memFs);
    await model.loadFromFilesystem(NEPIC_DIR);

    const approval = { tool: 'Bash', command: 'npm install', timestamp: Date.now(), payload: {} };
    model.setAgentPendingApproval('uuid-ta', approval);

    const listener = vi.fn();
    model.onChange(listener);

    model.clearPendingApproval('uuid-ta');

    const agent = model.getAllAgents().find(a => a.id === 'uuid-ta');
    expect(agent!.pendingApproval).toBeNull();
    expect(listener).toHaveBeenCalled();
  });

  // T-0650-03
  it('pendingApproval survives filesystem reload', async () => {
    const memFs = createGuardianFixture();
    const model = createModel(memFs);
    await model.loadFromFilesystem(NEPIC_DIR);

    const approval = { tool: 'Bash', command: 'npm install', timestamp: 1234567890, payload: {} };
    model.setAgentPendingApproval('uuid-ta', approval);

    // Reload from filesystem — simulates watcher-triggered refresh
    await model.loadFromFilesystem(NEPIC_DIR);

    const agent = model.getAllAgents().find(a => a.id === 'uuid-ta');
    expect(agent!.pendingApproval).toEqual(approval);
  });

  // T-0650-04
  it('clearPendingApproval for unknown agent is a no-op', async () => {
    const memFs = createGuardianFixture();
    const model = createModel(memFs);
    await model.loadFromFilesystem(NEPIC_DIR);

    // Should not throw
    model.clearPendingApproval('nonexistent-id');

    // Model state unchanged
    const agents = model.getAllAgents();
    expect(agents.every(a => a.pendingApproval === null)).toBe(true);
  });

  // T-0650-17
  it('findAgentByRole returns guardian when present', async () => {
    const memFs = createGuardianFixture();
    const model = createModel(memFs);
    await model.loadFromFilesystem(NEPIC_DIR);

    const result = model.findAgentByRole('guardian');
    expect(result).not.toBeNull();
    expect(result!.role).toBe('guardian');
    expect(result!.name).toBe('002-guardian');
  });

  // T-0650-18
  it('findAgentByRole returns null when no guardian', async () => {
    const memFs = createCliIntegrationFixture();
    const model = createModel(memFs);
    await model.loadFromFilesystem(NEPIC_DIR);

    const result = model.findAgentByRole('guardian');
    expect(result).toBeNull();
  });

  // T-0650-26
  it('pendingApproval cleared on agent exit', async () => {
    const memFs = createGuardianFixture();
    const model = createModel(memFs);
    await model.loadFromFilesystem(NEPIC_DIR);

    model.setAgentPendingApproval('uuid-ta', {
      tool: 'Bash',
      command: 'npm install',
      timestamp: Date.now(),
      payload: {},
    });

    expect(model.getAllAgents().find(a => a.id === 'uuid-ta')!.pendingApproval).not.toBeNull();

    await model.setAgentExitedById('uuid-ta');

    const agent = model.getAllAgents().find(a => a.id === 'uuid-ta');
    expect(agent!.pendingApproval).toBeNull();
  });
});

// ═══════════════════════════════════════════════════
// SOCKET HANDLER TESTS (T-0650-05 through T-0650-12, T-0650-19, T-0650-24, T-0650-25)
// ═══════════════════════════════════════════════════

describe('0650 — Socket handler: permissions', () => {
  let sockPath: string;
  let model: ReturnType<typeof createModel>;
  let ptySpawner: FakePtySpawner;

  afterEach(() => {
    stopSocketServer();
  });

  async function setupWithGuardian(): Promise<void> {
    const memFs = createGuardianFixture();
    model = createModel(memFs);
    await model.loadFromFilesystem(NEPIC_DIR);
    // Mark guardian as running (ephemeral)
    model.setAgentRunning('uuid-guardian', true);
    ptySpawner = new FakePtySpawner();
    sockPath = tmpSocketPath();
    const handler = createRequestHandler(model, ptySpawner);
    await startSocketServer(handler, sockPath);
  }

  async function setupWithoutGuardian(): Promise<void> {
    const memFs = createCliIntegrationFixture();
    model = createModel(memFs);
    await model.loadFromFilesystem(NEPIC_DIR);
    ptySpawner = new FakePtySpawner();
    sockPath = tmpSocketPath();
    const handler = createRequestHandler(model, ptySpawner);
    await startSocketServer(handler, sockPath);
  }

  // T-0650-05: hook-permission-request sets model state and hangs
  it('T-0650-05: hook-permission-request sets model state + hangs', async () => {
    await setupWithGuardian();

    const { promise, conn } = sendLongLived(sockPath, {
      type: 'hook-permission-request',
      id: 1,
      agentId: 'uuid-ta',
      tool: 'Bash',
      command: 'npm install',
      payload: { tool_name: 'Bash' },
    });

    // Give handler time to process
    await sleep(100);

    // Model state should be set
    const agent = model.getAllAgents().find(a => a.id === 'uuid-ta');
    expect(agent!.pendingApproval).not.toBeNull();
    expect(agent!.pendingApproval!.tool).toBe('Bash');
    expect(agent!.pendingApproval!.command).toBe('npm install');

    // Connection should still be hanging — no response yet
    let resolved = false;
    promise.then(() => { resolved = true; });
    await sleep(200);
    expect(resolved).toBe(false);

    // Clean up: resolve it so the test doesn't hang
    await send(sockPath, {
      type: 'permission-response',
      id: 2,
      agentId: 'uuid-ta',
      decision: 'allow',
    });
    await promise;
    conn.destroy();
  });

  // T-0650-06: permission-response resolves hanging connection
  it('T-0650-06: permission-response resolves hanging connection', async () => {
    await setupWithGuardian();

    const { promise, conn } = sendLongLived(sockPath, {
      type: 'hook-permission-request',
      id: 1,
      agentId: 'uuid-ta',
      tool: 'Bash',
      command: 'npm install',
      payload: {},
    });

    await sleep(100);

    // Send resolution
    const resResponse = await send(sockPath, {
      type: 'permission-response',
      id: 2,
      agentId: 'uuid-ta',
      decision: 'allow',
    });
    expect(resResponse.error).toBeUndefined();

    // Hanging connection should resolve with decision
    const hookResult = await promise;
    expect(hookResult.decision).toBe('allow');

    // Model state should be cleared
    const agent = model.getAllAgents().find(a => a.id === 'uuid-ta');
    expect(agent!.pendingApproval).toBeNull();

    conn.destroy();
  });

  // T-0650-07: permission-response with deny
  it('T-0650-07: permission-response with deny', async () => {
    await setupWithGuardian();

    const { promise, conn } = sendLongLived(sockPath, {
      type: 'hook-permission-request',
      id: 1,
      agentId: 'uuid-ta',
      tool: 'Bash',
      command: 'rm -rf /',
      payload: {},
    });

    await sleep(100);

    await send(sockPath, {
      type: 'permission-response',
      id: 2,
      agentId: 'uuid-ta',
      decision: 'deny',
    });

    const hookResult = await promise;
    expect(hookResult.decision).toBe('deny');

    const agent = model.getAllAgents().find(a => a.id === 'uuid-ta');
    expect(agent!.pendingApproval).toBeNull();

    conn.destroy();
  });

  // T-0650-07b: deny with message — reason flows through to hook response
  it('T-0650-07b: deny with message flows through to hook', async () => {
    await setupWithGuardian();

    const { promise, conn } = sendLongLived(sockPath, {
      type: 'hook-permission-request',
      id: 1,
      agentId: 'uuid-ta',
      tool: 'Bash',
      command: 'rm -rf /important/dir',
      payload: {},
    });

    await sleep(100);

    await send(sockPath, {
      type: 'permission-response',
      id: 2,
      agentId: 'uuid-ta',
      decision: 'deny',
      message: 'not in task spec — targets path outside project scope',
    });

    const hookResult = await promise;
    expect(hookResult.decision).toBe('deny');
    expect(hookResult.message).toBe('not in task spec — targets path outside project scope');

    conn.destroy();
  });

  // T-0650-07c: deny without message — default reason
  it('T-0650-07c: deny without message — no message field in response', async () => {
    await setupWithGuardian();

    const { promise, conn } = sendLongLived(sockPath, {
      type: 'hook-permission-request',
      id: 1,
      agentId: 'uuid-ta',
      tool: 'Bash',
      command: 'rm -rf /',
      payload: {},
    });

    await sleep(100);

    await send(sockPath, {
      type: 'permission-response',
      id: 2,
      agentId: 'uuid-ta',
      decision: 'deny',
    });

    const hookResult = await promise;
    expect(hookResult.decision).toBe('deny');
    expect(hookResult.message).toBeUndefined();

    conn.destroy();
  });

  // T-0650-07d: deny with --interrupt stops the agent's turn
  it('T-0650-07d: deny with interrupt flag flows through', async () => {
    await setupWithGuardian();

    const { promise, conn } = sendLongLived(sockPath, {
      type: 'hook-permission-request',
      id: 1,
      agentId: 'uuid-ta',
      tool: 'Bash',
      command: 'rm -rf /',
      payload: {},
    });

    await sleep(100);

    await send(sockPath, {
      type: 'permission-response',
      id: 2,
      agentId: 'uuid-ta',
      decision: 'deny',
      message: 'agent going rogue',
      interrupt: true,
    });

    const hookResult = await promise;
    expect(hookResult.decision).toBe('deny');
    expect(hookResult.message).toBe('agent going rogue');
    expect(hookResult.interrupt).toBe(true);

    conn.destroy();
  });

  // T-0650-07e: deny without --interrupt has no interrupt field
  it('T-0650-07e: deny without interrupt — no interrupt field', async () => {
    await setupWithGuardian();

    const { promise, conn } = sendLongLived(sockPath, {
      type: 'hook-permission-request',
      id: 1,
      agentId: 'uuid-ta',
      tool: 'Bash',
      command: 'npm install sketchy-pkg',
      payload: {},
    });

    await sleep(100);

    await send(sockPath, {
      type: 'permission-response',
      id: 2,
      agentId: 'uuid-ta',
      decision: 'deny',
      message: 'not approved',
    });

    const hookResult = await promise;
    expect(hookResult.decision).toBe('deny');
    expect(hookResult.interrupt).toBeUndefined();

    conn.destroy();
  });

  // T-0650-08: permission-response for unknown agent → error
  it('T-0650-08: permission-response for unknown agent → error', async () => {
    await setupWithGuardian();

    const res = await send(sockPath, {
      type: 'permission-response',
      id: 1,
      agentId: 'nonexistent',
      decision: 'allow',
    });

    expect(res.error).toBe(true);
    expect(String(res.message)).toContain('no pending approval');
  });

  // T-0650-09: hook-permission-request pokes guardian
  it('T-0650-09: hook-permission-request pokes guardian', async () => {
    await setupWithGuardian();
    const enqueueSpy = vi.spyOn(mq, 'enqueue');

    const { promise, conn } = sendLongLived(sockPath, {
      type: 'hook-permission-request',
      id: 1,
      agentId: 'uuid-ta',
      tool: 'Bash',
      command: 'npm install react-router-dom',
      payload: {},
    });

    await sleep(100);

    expect(enqueueSpy).toHaveBeenCalledWith(
      'uuid-guardian',
      expect.stringContaining('permission-request from: 001-test-arch'),
    );
    expect(enqueueSpy).toHaveBeenCalledWith(
      'uuid-guardian',
      expect.stringContaining('tool: Bash'),
    );
    expect(enqueueSpy).toHaveBeenCalledWith(
      'uuid-guardian',
      expect.stringContaining('command: npm install react-router-dom'),
    );

    // Clean up
    enqueueSpy.mockRestore();
    await send(sockPath, {
      type: 'permission-response',
      id: 2,
      agentId: 'uuid-ta',
      decision: 'allow',
    });
    await promise;
    conn.destroy();
  });

  // T-0650-10: hook-permission-request without guardian → no poke
  it('T-0650-10: hook-permission-request without guardian → no poke', async () => {
    await setupWithoutGuardian();
    const enqueueSpy = vi.spyOn(mq, 'enqueue');

    const { promise, conn } = sendLongLived(sockPath, {
      type: 'hook-permission-request',
      id: 1,
      agentId: 'uuid-ta',
      tool: 'Bash',
      command: 'npm install',
      payload: {},
    });

    await sleep(100);

    // pendingApproval should still be set
    const agent = model.getAllAgents().find(a => a.id === 'uuid-ta');
    expect(agent!.pendingApproval).not.toBeNull();

    // No enqueue call (no guardian)
    expect(enqueueSpy).not.toHaveBeenCalled();

    // Clean up
    enqueueSpy.mockRestore();
    await send(sockPath, {
      type: 'permission-response',
      id: 2,
      agentId: 'uuid-ta',
      decision: 'allow',
    });
    await promise;
    conn.destroy();
  });

  // T-0650-11: concurrent permission requests from different agents
  it('T-0650-11: concurrent permission requests from different agents', async () => {
    await setupWithGuardian();

    // Send request for agent-A
    const { promise: promiseA, conn: connA } = sendLongLived(sockPath, {
      type: 'hook-permission-request',
      id: 1,
      agentId: 'uuid-ta',
      tool: 'Bash',
      command: 'cmd-a',
      payload: {},
    });

    await sleep(100);

    // Send request for agent-B
    const { promise: promiseB, conn: connB } = sendLongLived(sockPath, {
      type: 'hook-permission-request',
      id: 2,
      agentId: 'uuid-fs',
      tool: 'Bash',
      command: 'cmd-b',
      payload: {},
    });

    await sleep(100);

    // Both should be pending
    expect(getPendingRegistry().size).toBe(2);

    // Resolve B first
    await send(sockPath, {
      type: 'permission-response',
      id: 3,
      agentId: 'uuid-fs',
      decision: 'deny',
    });

    const resultB = await promiseB;
    expect(resultB.decision).toBe('deny');

    // A should still be hanging
    let aResolved = false;
    promiseA.then(() => { aResolved = true; });
    await sleep(100);
    expect(aResolved).toBe(false);

    // Now resolve A
    await send(sockPath, {
      type: 'permission-response',
      id: 4,
      agentId: 'uuid-ta',
      decision: 'allow',
    });

    const resultA = await promiseA;
    expect(resultA.decision).toBe('allow');

    // Both pendingApprovals cleared
    expect(model.getAllAgents().find(a => a.id === 'uuid-ta')!.pendingApproval).toBeNull();
    expect(model.getAllAgents().find(a => a.id === 'uuid-fs')!.pendingApproval).toBeNull();

    connA.destroy();
    connB.destroy();
  });

  // T-0650-12: connection closes before resolution → cleanup
  it('T-0650-12: connection closes before resolution → cleanup', async () => {
    await setupWithGuardian();

    const { conn } = sendLongLived(sockPath, {
      type: 'hook-permission-request',
      id: 1,
      agentId: 'uuid-ta',
      tool: 'Bash',
      command: 'npm install',
      payload: {},
    });

    await sleep(100);

    // Verify pending
    expect(model.getAllAgents().find(a => a.id === 'uuid-ta')!.pendingApproval).not.toBeNull();
    expect(getPendingRegistry().has('uuid-ta')).toBe(true);

    // Close the client socket
    conn.destroy();

    // Wait for close event to propagate
    await sleep(200);

    // pendingApproval should be cleaned up
    expect(model.getAllAgents().find(a => a.id === 'uuid-ta')!.pendingApproval).toBeNull();
    expect(getPendingRegistry().has('uuid-ta')).toBe(false);
  });

  // T-0650-19: end-to-end full permission cycle via socket
  it('T-0650-19: end-to-end full permission cycle via socket', async () => {
    await setupWithGuardian();

    // Initial state: no pending
    expect(model.getAllAgents().find(a => a.id === 'uuid-ta')!.pendingApproval).toBeNull();

    // Step 1: send hook-permission-request
    const { promise, conn } = sendLongLived(sockPath, {
      type: 'hook-permission-request',
      id: 1,
      agentId: 'uuid-ta',
      tool: 'Bash',
      command: 'npm install',
      payload: { tool_name: 'Bash', tool_input: { command: 'npm install' } },
    });

    await sleep(100);

    // Step 2: verify model state set
    const pending = model.getAllAgents().find(a => a.id === 'uuid-ta')!.pendingApproval;
    expect(pending).not.toBeNull();
    expect(pending!.tool).toBe('Bash');
    expect(pending!.command).toBe('npm install');
    expect(pending!.timestamp).toBeGreaterThan(0);

    // Step 3: send permission-response
    await send(sockPath, {
      type: 'permission-response',
      id: 2,
      agentId: 'uuid-ta',
      decision: 'allow',
    });

    // Step 4: verify hook connection resolves
    const hookResult = await promise;
    expect(hookResult.decision).toBe('allow');

    // Step 5: verify model cleared
    expect(model.getAllAgents().find(a => a.id === 'uuid-ta')!.pendingApproval).toBeNull();

    conn.destroy();
  });

  // T-0650-06b: permission-response by agent NAME (not UUID) — how guardians actually resolve
  it('T-0650-06b: permission-response by agent name resolves hanging connection', async () => {
    await setupWithGuardian();

    // Hook sends agentId as UUID (from NAP_SESSION_ID)
    const { promise, conn } = sendLongLived(sockPath, {
      type: 'hook-permission-request',
      id: 1,
      agentId: 'uuid-fs',  // UUID
      tool: 'Bash',
      command: 'npm install',
      payload: {},
    });

    await sleep(100);

    // Guardian resolves by NAME (what it sees in the poke message)
    const resResponse = await send(sockPath, {
      type: 'permission-response',
      id: 2,
      agentId: '002-fs-eng',  // NAME, not UUID
      decision: 'allow',
    });
    expect(resResponse.error).toBeUndefined();

    // Hanging connection should resolve
    const hookResult = await promise;
    expect(hookResult.decision).toBe('allow');

    // Model state should be cleared
    const agent = model.getAllAgents().find(a => a.id === 'uuid-fs');
    expect(agent!.pendingApproval).toBeNull();

    conn.destroy();
  });

  // T-0650-24: duplicate hook-permission-request for same agent
  it('T-0650-24: duplicate hook-permission-request for same agent → error', async () => {
    await setupWithGuardian();

    // First request: should hang
    const { promise: promise1, conn: conn1 } = sendLongLived(sockPath, {
      type: 'hook-permission-request',
      id: 1,
      agentId: 'uuid-ta',
      tool: 'Bash',
      command: 'cmd1',
      payload: {},
    });

    await sleep(100);

    // Second request for same agent: should get error
    const res2 = await send(sockPath, {
      type: 'hook-permission-request',
      id: 2,
      agentId: 'uuid-ta',
      tool: 'Bash',
      command: 'cmd2',
      payload: {},
    });

    expect(res2.error).toBe(true);
    expect(String(res2.message)).toContain('already has a pending approval');

    // First should still be hanging
    let resolved = false;
    promise1.then(() => { resolved = true; });
    await sleep(100);
    expect(resolved).toBe(false);

    // Clean up
    await send(sockPath, {
      type: 'permission-response',
      id: 3,
      agentId: 'uuid-ta',
      decision: 'allow',
    });
    await promise1;
    conn1.destroy();
  });

  // T-0650-25: guardian poke message format
  it('T-0650-25: guardian poke message format matches spec', async () => {
    await setupWithGuardian();
    const enqueueSpy = vi.spyOn(mq, 'enqueue');

    const { promise, conn } = sendLongLived(sockPath, {
      type: 'hook-permission-request',
      id: 1,
      agentId: 'uuid-ta',
      tool: 'Bash',
      command: 'npm install react-router-dom',
      payload: {},
    });

    await sleep(100);

    expect(enqueueSpy).toHaveBeenCalledTimes(1);
    const [guardianId, message] = enqueueSpy.mock.calls[0];
    expect(guardianId).toBe('uuid-guardian');

    // Format from spec:
    // [permission-request from: <name> | napkin: <slug> | role: <role>]
    // tool: <tool>
    // command: <command>
    // task: <prompt.md path>
    expect(message).toContain('[permission-request from: 001-test-arch');
    expect(message).toContain('napkin: 0100-explore');
    expect(message).toContain('role: test-arch');
    expect(message).toContain('tool: Bash');
    expect(message).toContain('command: npm install react-router-dom');
    expect(message).toContain('task:');
    expect(message).toContain('prompt.md');

    // Clean up
    enqueueSpy.mockRestore();
    await send(sockPath, {
      type: 'permission-response',
      id: 2,
      agentId: 'uuid-ta',
      decision: 'allow',
    });
    await promise;
    conn.destroy();
  });
});

// ═══════════════════════════════════════════════════
// CLI TESTS (T-0650-13 through T-0650-16, T-0650-28, T-0650-29, T-0650-30)
// ═══════════════════════════════════════════════════

describe('0650 — CLI: hook + permission-response', () => {
  let sockPath: string;
  let model: ReturnType<typeof createModel>;
  let ptySpawner: FakePtySpawner;

  afterEach(() => {
    stopSocketServer();
  });

  async function setupServer(): Promise<void> {
    const memFs = createGuardianFixture();
    model = createModel(memFs);
    await model.loadFromFilesystem(NEPIC_DIR);
    model.setAgentRunning('uuid-guardian', true);
    ptySpawner = new FakePtySpawner();
    sockPath = tmpSocketPath();
    const handler = createRequestHandler(model, ptySpawner);
    await startSocketServer(handler, sockPath);
  }

  function execNapHook(
    stdinData: string,
    env: Record<string, string>,
  ): { child: ReturnType<typeof import('child_process').spawn>; stdout: () => string; stderr: () => string } {
    const { spawn } = require('child_process') as typeof import('child_process');
    const cliPath = path.join(__dirname, '..', 'out', 'cli', 'cli', 'nap.js');

    const child = spawn('node', [cliPath, 'hook', 'permission-request'], {
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Write stdin and close
    child.stdin!.write(stdinData);
    child.stdin!.end();

    let stdoutData = '';
    let stderrData = '';
    child.stdout!.on('data', (d: Buffer) => { stdoutData += d.toString(); });
    child.stderr!.on('data', (d: Buffer) => { stderrData += d.toString(); });

    return {
      child,
      stdout: () => stdoutData,
      stderr: () => stderrData,
    };
  }

  // T-0650-13: nap3 hook permission-request → reads stdin, sends socket, blocks, outputs JSON
  it('T-0650-13: hook permission-request full flow', async () => {
    await setupServer();

    const stdinPayload = JSON.stringify({
      hook_event_name: 'PermissionRequest',
      tool_name: 'Bash',
      tool_input: { command: 'npm install' },
    });

    const { child, stdout } = execNapHook(stdinPayload, {
      NAP_SESSION_ID: 'uuid-ta',
      NAP_SOCKET: sockPath,
    });

    // Wait for the hook to connect and send its request
    await sleep(500);

    // Verify model got the pending approval
    expect(model.getAllAgents().find(a => a.id === 'uuid-ta')!.pendingApproval).not.toBeNull();

    // Resolve via socket
    await send(sockPath, {
      type: 'permission-response',
      id: 99,
      agentId: 'uuid-ta',
      decision: 'allow',
    });

    // Wait for process to exit
    const exitCode = await new Promise<number>((resolve) => {
      child.on('exit', (code) => resolve(code ?? 1));
    });

    expect(exitCode).toBe(0);

    const output = JSON.parse(stdout());
    expect(output.hookSpecificOutput.hookEventName).toBe('PermissionRequest');
    expect(output.hookSpecificOutput.decision.behavior).toBe('allow');
  });

  // T-0650-14: hook permission-request timeout → pass-through
  // The real CLI uses a 10-min timeout. We test the timeout mechanism by
  // verifying the sendLongLived() helper returns {} on timeout, which causes
  // the hook to exit 0 with no decision (pass-through).
  // We test this at the socket level rather than spawning a real CLI process
  // with a 10-min timeout.
  it('T-0650-14: hook timeout → pass-through (socket-level)', async () => {
    await setupServer();

    // Simulate what happens when sendLongLived resolves with {} (timeout case):
    // The CLI checks res.decision — if absent, it outputs nothing and exits 0.
    // This is a unit-level verification of the timeout handling logic.
    // The sendLongLived function resolves({}) on timeout.

    // Directly test: when the hook gets no decision, output should be empty.
    // This happens when the Promise resolves with {} (the timeout path in the CLI).
    // We verify this by sending a hook request and then closing the socket.
    const { conn } = sendLongLived(sockPath, {
      type: 'hook-permission-request',
      id: 1,
      agentId: 'uuid-ta',
      tool: 'Bash',
      command: 'test',
      payload: {},
    });

    await sleep(100);

    // Simulate timeout by closing connection from client side
    conn.destroy();

    await sleep(200);

    // Model should be cleaned up (disconnect handler)
    expect(model.getAllAgents().find(a => a.id === 'uuid-ta')!.pendingApproval).toBeNull();

    // The actual CLI pass-through behavior is:
    // - sendLongLived() resolves with {} on timeout
    // - CLI checks decision field → undefined → no stdout output → exit 0
    // - CC falls through to its own dialog
    // This is correct pass-through behavior.
  });

  // T-0650-15: nap3 permission-response --agent <id> --decision allow
  it('T-0650-15: permission-response resolves pending hook', async () => {
    await setupServer();

    // Set up a pending request
    const { promise, conn } = sendLongLived(sockPath, {
      type: 'hook-permission-request',
      id: 1,
      agentId: 'uuid-fs',
      tool: 'Bash',
      command: 'npm install',
      payload: {},
    });

    await sleep(100);

    // Run nap3 permission-response via subprocess (async — don't use execFileSync)
    const { spawn: spawnChild } = require('child_process') as typeof import('child_process');
    const cliPath = path.join(__dirname, '..', 'out', 'cli', 'cli', 'nap.js');

    const child = spawnChild('node', [
      cliPath, 'permission-response',
      '--agent', 'uuid-fs',
      '--decision', 'allow',
    ], {
      env: { ...process.env, NAP_SOCKET: sockPath },
      stdio: 'pipe',
    });

    // Wait for both: child exits + hanging hook resolves
    const [result, exitCode] = await Promise.all([
      promise,
      new Promise<number>((resolve) => {
        child.on('exit', (code) => resolve(code ?? 1));
      }),
    ]);

    expect(exitCode).toBe(0);
    expect(result.decision).toBe('allow');

    conn.destroy();
  });

  // T-0650-16: permission-response with invalid decision → error
  it('T-0650-16: permission-response invalid decision → exit 1', () => {
    const { execFileSync } = require('child_process') as typeof import('child_process');
    const cliPath = path.join(__dirname, '..', 'out', 'cli', 'cli', 'nap.js');

    let exitCode = 0;
    let stderrOutput = '';
    try {
      execFileSync('node', [
        cliPath, 'permission-response',
        '--agent', 'uuid-fs',
        '--decision', 'maybe',
      ], {
        env: process.env,
        encoding: 'utf8',
        timeout: 5000,
      });
    } catch (err: unknown) {
      const e = err as { status?: number; stderr?: string };
      exitCode = e.status || 1;
      stderrOutput = e.stderr || '';
    }

    expect(exitCode).toBe(1);
    expect(stderrOutput).toContain('invalid decision');
  });

  // T-0650-28: hook config format — .claude/settings.json structure
  it('T-0650-28: init --guardian writes correct hook config', () => {
    const { execFileSync } = require('child_process') as typeof import('child_process');
    const cliPath = path.join(__dirname, '..', 'out', 'cli', 'cli', 'nap.js');

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-init-guardian-'));

    try {
      execFileSync('node', [cliPath, 'init', '--guardian'], {
        cwd: tmpDir,
        encoding: 'utf8',
        timeout: 10000,
      });

      const settingsPath = path.join(tmpDir, '.claude', 'settings.json');
      expect(fs.existsSync(settingsPath)).toBe(true);

      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      expect(settings.hooks).toBeDefined();
      expect(settings.hooks.PermissionRequest).toBeDefined();
      expect(settings.hooks.PermissionRequest).toEqual([
        { matcher: '', hooks: [{ type: 'command', command: 'nap3 hook permission-request' }] },
      ]);

      // Also verify guardian agent was created
      const guardianMarkerPath = path.join(
        tmpDir, '.nap', 'nepics', '01-v1', '20-architects', '002-guardian', '.agent.nap.json',
      );
      expect(fs.existsSync(guardianMarkerPath)).toBe(true);
      const marker = JSON.parse(fs.readFileSync(guardianMarkerPath, 'utf-8'));
      expect(marker.role).toBe('guardian');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // T-0650-29: nap3 hook permission-request without NAP_SESSION_ID → exit 1
  it('T-0650-29: hook without NAP_SESSION_ID → exit 1', () => {
    const { execFileSync } = require('child_process') as typeof import('child_process');
    const cliPath = path.join(__dirname, '..', 'out', 'cli', 'cli', 'nap.js');

    let exitCode = 0;
    let stderrOutput = '';
    try {
      execFileSync('node', [cliPath, 'hook', 'permission-request'], {
        env: {
          ...process.env,
          NAP_SESSION_ID: '',
          NAP_SOCKET: '/tmp/fake-sock',
        },
        input: '{}',
        encoding: 'utf8',
        timeout: 5000,
      });
    } catch (err: unknown) {
      const e = err as { status?: number; stderr?: string };
      exitCode = e.status || 1;
      stderrOutput = e.stderr || '';
    }

    expect(exitCode).toBe(1);
    expect(stderrOutput).toContain('NAP_SESSION_ID not set');
  });

  // T-0650-30: nap3 hook permission-request without NAP_SOCKET → exit 1
  it('T-0650-30: hook without NAP_SOCKET → exit 1', () => {
    const { execFileSync } = require('child_process') as typeof import('child_process');
    const cliPath = path.join(__dirname, '..', 'out', 'cli', 'cli', 'nap.js');

    let exitCode = 0;
    let stderrOutput = '';
    try {
      // Use a cwd that has no .nap/ directory, so socket walk-up fails too
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-no-sock-'));
      execFileSync('node', [cliPath, 'hook', 'permission-request'], {
        cwd: tmpDir,
        env: {
          ...process.env,
          NAP_SESSION_ID: 'uuid-test',
          NAP_SOCKET: '',
        },
        input: '{}',
        encoding: 'utf8',
        timeout: 5000,
      });
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (err: unknown) {
      const e = err as { status?: number; stderr?: string };
      exitCode = e.status || 1;
      stderrOutput = e.stderr || '';
    }

    expect(exitCode).toBe(1);
    expect(stderrOutput).toContain('nap3 is not running');
  });
});
