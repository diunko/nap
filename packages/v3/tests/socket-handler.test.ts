import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { startSocketServer, stopSocketServer } from '../src/main/socket-server';
import { createRequestHandler } from '../src/main/socket-handler';
import { createModel } from '../src/main/model';
import { FakePtySpawner } from '../src/main/pty-spawner';
import { NdjsonParser, serialize } from '../src/shared/ndjson';
import * as mq from '../src/main/message-queue';
import {
  createCliIntegrationFixture,
  createEmptyNepicFixture,
  NEPIC_DIR,
} from './fixtures';

function tmpSocketPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-handler-test-'));
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

describe('Socket handlers', () => {
  let sockPath: string;
  let model: ReturnType<typeof createModel>;
  let ptySpawner: FakePtySpawner;

  afterEach(() => {
    stopSocketServer();
  });

  async function setupF10(): Promise<void> {
    const memFs = createCliIntegrationFixture();
    model = createModel(memFs);
    await model.loadFromFilesystem(NEPIC_DIR);
    ptySpawner = new FakePtySpawner();
    sockPath = tmpSocketPath();
    const handler = createRequestHandler(model, ptySpawner);
    await startSocketServer(handler, sockPath);
  }

  async function setupF11(): Promise<void> {
    const memFs = createEmptyNepicFixture();
    model = createModel(memFs);
    await model.loadFromFilesystem(NEPIC_DIR);
    ptySpawner = new FakePtySpawner();
    sockPath = tmpSocketPath();
    const handler = createRequestHandler(model, ptySpawner);
    await startSocketServer(handler, sockPath);
  }

  // T-0210-40
  it('create-napkin handler → model.createNapkin → JSON response', async () => {
    await setupF11();
    const res = await send(sockPath, { type: 'create-napkin', id: 1, slug: '0300-deploy', status: 'backlog' });
    expect(res['slug']).toBe('0300-deploy');
    expect(res['status']).toBe('backlog');
    expect(res['dir']).toBeDefined();
    expect(model.getNapkins().find(n => n.slug === '0300-deploy')).toBeDefined();
  });

  // T-0210-41
  it('create-agent handler → model.createAgentStub → JSON response', async () => {
    await setupF10();
    const res = await send(sockPath, {
      type: 'create-agent', id: 1,
      napkinSlug: '0100-explore', name: '003-test-eng', role: 'test-eng',
    });
    expect(res['name']).toBe('003-test-eng');
    expect(res['role']).toBe('test-eng');
    expect(res['napkin']).toBe('0100-explore');
    expect(res['id']).toBeDefined();
  });

  // T-0210-42
  it('create-architect handler → model.createArchitectStub → JSON response', async () => {
    await setupF11();
    const res = await send(sockPath, { type: 'create-architect', id: 1, name: '002-nova' });
    expect(res['name']).toBe('002-nova');
    expect(res['role']).toBe('architect');
    expect(res['dir']).toContain('20-architects');
  });

  // T-0210-43
  it('create-nepic handler → model.createNepic → JSON response', async () => {
    await setupF11();
    const res = await send(sockPath, { type: 'create-nepic', id: 1, slug: '02-v2', displayName: 'Version 2' });
    expect(res['slug']).toBe('02-v2');
    expect(res['name']).toBe('Version 2');
    expect(res['architectId']).toBeDefined();
  });

  // T-0210-44
  it('start handler → model.startAgentByName → pty spawned → JSON response', async () => {
    await setupF10();
    const res = await send(sockPath, { type: 'start', id: 1, name: '001-fs-eng', prompt: 'read prompt.md' });
    expect(res['name']).toBe('001-fs-eng');
    expect(res['id']).toBe('uuid-fresh');
    expect(ptySpawner.spawned).toHaveLength(1);
  });

  // T-0210-45
  it('done handler → model.setAgentDone → in-memory only', async () => {
    await setupF10();
    const res = await send(sockPath, { type: 'done', id: 1, sessionId: 'uuid-ta' });
    expect(res['error']).toBeUndefined();

    const agent = model.getAllAgents().find(a => a.id === 'uuid-ta');
    expect(agent!.done).toBe(true);
  });

  // T-0210-46
  it('stop handler → pty killed + model.setAgentExited', async () => {
    await setupF10();
    // Start the agent first so it's running
    model.setAgentRunning('uuid-ta', true);
    ptySpawner.spawn({ id: 'uuid-ta', command: 'test', cwd: '' });

    const res = await send(sockPath, { type: 'stop', id: 1, name: '001-test-arch' });
    expect(res['error']).toBeUndefined();

    expect(ptySpawner.isRunning('uuid-ta')).toBe(false);
    const agent = model.getAllAgents().find(a => a.id === 'uuid-ta');
    expect(agent!.exited).toBe(true);
  });

  // T-0210-47
  it('set-status handler → model.setNapkinStatus', async () => {
    await setupF10();
    const res = await send(sockPath, { type: 'set-status', id: 1, napkinSlug: '0100-explore', status: 'review' });
    expect(res['error']).toBeUndefined();
    expect(model.getNapkins().find(n => n.slug === '0100-explore')!.status).toBe('review');
  });

  // T-0210-48
  it('set-status with invalid phase → error', async () => {
    await setupF10();
    const res = await send(sockPath, { type: 'set-status', id: 1, napkinSlug: '0100-explore', status: 'wip' });
    expect(res['error']).toBe(true);
    expect(String(res['message'])).toContain('unknown phase');
    expect(String(res['message'])).toContain('backlog, todo, doing, review, done');
  });

  // T-0210-49
  it('ps handler → getAllAgentsTree → tree structure', async () => {
    await setupF10();
    const res = await send(sockPath, { type: 'ps', id: 1 });
    expect(res['agents']).toBeDefined();
    const agents = res['agents'] as Array<{ name: string; role: string; children: unknown[] }>;
    const arch = agents.find(a => a.name === '001-architect');
    expect(arch).toBeDefined();
    expect(arch!.role).toBe('architect');
    expect(arch!.children).toBeDefined();
  });

  // T-0210-50
  it('status (inspect) handler → model.getStatus', async () => {
    await setupF10();
    const res = await send(sockPath, { type: 'status', id: 1, query: { napkin: '0100-explore' } });
    expect(res['phase']).toBe('doing');
    expect(res['agentCount']).toBe(2);
  });

  // T-0210-70
  it('start nonexistent agent → "no agent named" with suggestions', async () => {
    await setupF10();
    const res = await send(sockPath, { type: 'start', id: 1, name: 'test-arch' });
    expect(res['error']).toBe(true);
    expect(String(res['message'])).toContain("no agent named 'test-arch'");
    expect(String(res['message'])).toContain('did you mean');
    expect(String(res['message'])).toContain('001-test-arch');
  });

  // T-0210-71
  it('start already-running agent → "already running"', async () => {
    await setupF10();
    model.setAgentRunning('uuid-ta', true);
    const res = await send(sockPath, { type: 'start', id: 1, name: '001-test-arch' });
    expect(res['error']).toBe(true);
    expect(String(res['message'])).toContain('already running');
  });

  // T-0210-72
  it('create duplicate agent → "already exists"', async () => {
    await setupF10();
    const res = await send(sockPath, {
      type: 'create-agent', id: 1,
      napkinSlug: '0100-explore', name: '001-test-arch', role: 'test-arch',
    });
    expect(res['error']).toBe(true);
    expect(String(res['message'])).toContain('already exists');
  });

  // T-0660-20: key → direct pty write, bypasses message queue
  it('key handler → direct pty write', async () => {
    await setupF10();
    const res = await send(sockPath, {
      type: 'key', id: 1, name: '001-test-arch', data: '\r',
    });
    expect(res['error']).toBeUndefined();
    expect(ptySpawner.writes).toEqual([{ id: 'uuid-ta', data: '\r' }]);
  });

  // T-0660-21: key with unknown agent → error with suggestions
  it('key handler — unknown agent → error with suggestions', async () => {
    await setupF10();
    const res = await send(sockPath, {
      type: 'key', id: 1, name: 'test-arch', data: '\r',
    });
    expect(res['error']).toBe(true);
    expect(String(res['message'])).toContain('did you mean');
  });

  // T-0660-20 (extended): key bypasses message queue — verify enqueue NOT called
  it('T-0660-20: key bypasses message queue', async () => {
    await setupF10();
    const enqueueSpy = vi.spyOn(mq, 'enqueue');
    const res = await send(sockPath, {
      type: 'key', id: 1, name: '001-test-arch', data: '\r',
    });
    expect(res['error']).toBeUndefined();
    expect(ptySpawner.writes).toEqual([{ id: 'uuid-ta', data: '\r' }]);
    expect(enqueueSpy).not.toHaveBeenCalled();
    enqueueSpy.mockRestore();
  });

  // T-0660-22: key to non-running agent (agent exists but hasn't been started)
  it('T-0660-22: key to non-running agent — write is a no-op, no crash', async () => {
    await setupF10();
    // 001-fs-eng (napkin 0200-build) exists but has started=false
    const res = await send(sockPath, {
      type: 'key', id: 1, name: '001-fs-eng', data: '\r',
    });
    // Should not crash — FakePtySpawner.write records it even for non-spawned processes
    expect(res['error']).toBeUndefined();
  });

  // T-0660-30: key vs poke — key has no 3-step delivery (full comparison)
  it('T-0660-30: key "1" → single write; poke "1" → enqueue (3-step)', async () => {
    await setupF10();
    // Send key
    const keyRes = await send(sockPath, {
      type: 'key', id: 1, name: '001-test-arch', data: '1',
    });
    expect(keyRes['error']).toBeUndefined();
    // key: exactly 1 write of "1", no Esc, no CR
    expect(ptySpawner.writes).toEqual([{ id: 'uuid-ta', data: '1' }]);

    // Send poke — goes through message queue, not direct writes
    const enqueueSpy = vi.spyOn(mq, 'enqueue');
    const pokeRes = await send(sockPath, {
      type: 'poke', id: 2, name: '001-test-arch', message: '1',
    });
    expect(pokeRes['error']).toBeUndefined();
    expect(enqueueSpy).toHaveBeenCalledWith('uuid-ta', '1', false);
    enqueueSpy.mockRestore();

    // key writes should still be just the one from before — poke went through MQ
    expect(ptySpawner.writes).toEqual([{ id: 'uuid-ta', data: '1' }]);
  });

  // T-0660-30: key sends exact bytes, no Escape/CR wrapping
  it('key sends exact bytes, no Escape/CR wrapping', async () => {
    await setupF10();
    const res = await send(sockPath, {
      type: 'key', id: 1, name: '001-test-arch', data: '1',
    });
    expect(res['error']).toBeUndefined();
    // key: exactly 1 write of "1"
    expect(ptySpawner.writes).toEqual([{ id: 'uuid-ta', data: '1' }]);
  });

  // ── log handler tests ──

  it('log handler returns scrollback lines', async () => {
    await setupF10();
    ptySpawner.simulateOutput('uuid-ta', 'line1\nline2\nline3\n');

    const res = await send(sockPath, { type: 'log', id: 1, name: '001-test-arch' });
    expect(res['error']).toBeUndefined();
    const lines = res['lines'] as string[];
    expect(lines).toContain('line1');
    expect(lines).toContain('line2');
    expect(lines).toContain('line3');
  });

  it('log handler respects tail parameter', async () => {
    await setupF10();
    const manyLines = Array.from({ length: 50 }, (_, i) => `line-${i}`).join('\n') + '\n';
    ptySpawner.simulateOutput('uuid-ta', manyLines);

    const res = await send(sockPath, { type: 'log', id: 1, name: '001-test-arch', tail: 5 });
    expect(res['error']).toBeUndefined();
    const lines = res['lines'] as string[];
    expect(lines).toHaveLength(5);
    expect(lines[0]).toBe('line-45');
    expect(lines[4]).toBe('line-49');
  });

  it('log handler defaults to 20 lines', async () => {
    await setupF10();
    const manyLines = Array.from({ length: 50 }, (_, i) => `line-${i}`).join('\n') + '\n';
    ptySpawner.simulateOutput('uuid-ta', manyLines);

    const res = await send(sockPath, { type: 'log', id: 1, name: '001-test-arch' });
    expect(res['error']).toBeUndefined();
    const lines = res['lines'] as string[];
    expect(lines).toHaveLength(20);
    expect(lines[0]).toBe('line-30');
    expect(lines[19]).toBe('line-49');
  });

  it('log handler with unknown agent → error', async () => {
    await setupF10();
    const res = await send(sockPath, { type: 'log', id: 1, name: 'nobody' });
    expect(res['error']).toBe(true);
  });
});
