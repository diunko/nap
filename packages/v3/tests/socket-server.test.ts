import { describe, it, expect, afterEach } from 'vitest';
import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { startSocketServer, stopSocketServer } from '../src/main/socket-server';
import { NdjsonParser, serialize } from '../src/shared/ndjson';

function tmpSocketPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-sock-test-'));
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

describe('Socket server', () => {
  afterEach(() => {
    stopSocketServer();
  });

  // T-0210-01
  it('round-trip — send request, receive response', async () => {
    const sockPath = tmpSocketPath();
    const handler = async (msg: unknown) => {
      const req = msg as { id: number; type: string };
      return { id: req.id, ok: true, echo: req.type };
    };
    await startSocketServer(handler, sockPath);
    const response = await send(sockPath, { type: 'ping', id: 1 });
    expect(response).toMatchObject({ id: 1, ok: true, echo: 'ping' });
  });

  // T-0210-02
  it('handler error → error response with request id', async () => {
    const sockPath = tmpSocketPath();
    const handler = async () => {
      throw new Error('boom');
    };
    await startSocketServer(handler, sockPath);
    const response = await send(sockPath, { type: 'bad', id: 1 });
    expect(response).toMatchObject({ id: 1, error: true });
    expect(response['message']).toContain('boom');
  });

  // T-0210-03
  it('concurrent connections don\'t interfere', async () => {
    const sockPath = tmpSocketPath();
    const handler = async (msg: unknown) => {
      const req = msg as { id: number; name: string };
      return { id: req.id, name: req.name };
    };
    await startSocketServer(handler, sockPath);
    const [r1, r2] = await Promise.all([
      send(sockPath, { id: 1, name: 'alice' }),
      send(sockPath, { id: 2, name: 'bob' }),
    ]);
    expect(r1).toMatchObject({ id: 1, name: 'alice' });
    expect(r2).toMatchObject({ id: 2, name: 'bob' });
  });

  // T-0210-04
  it('stale socket file cleaned up on server start', async () => {
    const sockPath = tmpSocketPath();
    fs.writeFileSync(sockPath, '');  // stale socket
    const handler = async (msg: unknown) => {
      const req = msg as { id: number };
      return { id: req.id, ok: true };
    };
    await startSocketServer(handler, sockPath);  // should not throw
    const response = await send(sockPath, { type: 'ping', id: 1 });
    expect(response['id']).toBe(1);
  });
});
