import { describe, it, expect, afterEach } from 'vitest';
import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { startSocketServer, stopSocketServer } from '../src/main/socket-server';
import { createRequestHandler } from '../src/main/socket-handler';
import { createModel } from '../src/main/model';
import { FakePtySpawner } from '../src/main/pty-spawner';
import { FakeBridge, wireModelToBridge } from '../src/main/bridge';
import { NdjsonParser, serialize } from '../src/shared/ndjson';
import type { AppSnapshot } from '../src/shared/bridge-types';
import {
  createCliIntegrationFixture,
  createEmptyNepicFixture,
  NEPIC_DIR,
} from './fixtures';

function tmpSocketPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-bridge-test-'));
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

describe('Socket handler → model → bridge snapshot', () => {
  let sockPath: string;
  let model: ReturnType<typeof createModel>;
  let ptySpawner: FakePtySpawner;
  let bridge: FakeBridge;
  let snapshot: AppSnapshot | null;

  afterEach(() => {
    stopSocketServer();
  });

  async function setup(useF10: boolean): Promise<void> {
    const memFs = useF10 ? createCliIntegrationFixture() : createEmptyNepicFixture();
    model = createModel(memFs);
    await model.loadFromFilesystem(NEPIC_DIR);
    ptySpawner = new FakePtySpawner();
    bridge = new FakeBridge();
    wireModelToBridge(model, bridge, 'test-nepic');
    snapshot = null;
    bridge.onSnapshot((s) => { snapshot = s; });
    sockPath = tmpSocketPath();
    const handler = createRequestHandler(model, ptySpawner);
    await startSocketServer(handler, sockPath);
  }

  // T-0210-75
  it('create-napkin → model → bridge snapshot includes new napkin', async () => {
    await setup(false);
    await send(sockPath, { type: 'create-napkin', id: 1, slug: '0300-deploy', status: 'todo' });
    expect(snapshot).not.toBeNull();
    expect(snapshot!.napkins.find(n => n.slug === '0300-deploy')).toBeDefined();
    expect(snapshot!.napkins.find(n => n.slug === '0300-deploy')!.status).toBe('todo');
  });

  // T-0210-76
  it('start → model → bridge snapshot shows running', async () => {
    await setup(true);
    await send(sockPath, { type: 'start', id: 1, name: '001-fs-eng', prompt: 'go' });
    expect(snapshot).not.toBeNull();
    const agent = snapshot!.napkins
      .flatMap(n => n.agents)
      .find(a => a.name === '001-fs-eng');
    expect(agent).toBeDefined();
    expect(agent!.running).toBe(true);
    expect(agent!.started).toBe(true);
  });

  // T-0210-77
  it('done → model → bridge snapshot shows done', async () => {
    await setup(true);
    await send(sockPath, { type: 'done', id: 1, sessionId: 'uuid-ta' });
    expect(snapshot).not.toBeNull();
    const agent = snapshot!.napkins
      .flatMap(n => n.agents)
      .find(a => a.id === 'uuid-ta');
    expect(agent).toBeDefined();
    expect(agent!.done).toBe(true);
  });
});
