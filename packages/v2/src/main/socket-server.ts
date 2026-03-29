import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import { NdjsonParser, serialize } from '../shared/ndjson';
import { isSocketAlive } from '../shared/constants';

export type RequestHandler = (msg: unknown) => unknown | Promise<unknown>;

let server: net.Server | null = null;
let activeSocketPath: string | null = null;

export async function startSocketServer(
  handler: RequestHandler,
  socketPath: string,
): Promise<void> {
  // Ensure socket directory exists
  const socketDir = path.dirname(socketPath);
  fs.mkdirSync(socketDir, { recursive: true });

  // Handle existing socket file
  if (fs.existsSync(socketPath)) {
    const alive = await isSocketAlive(socketPath);
    if (alive) {
      throw new Error('Another instance of Nap is already running');
    }
    // Stale socket — remove it
    fs.unlinkSync(socketPath);
  }

  activeSocketPath = socketPath;

  server = net.createServer((conn) => {
    const parser = new NdjsonParser(async (msg) => {
      try {
        const res = await handler(msg);
        conn.write(serialize(res));
      } catch (err) {
        const req = msg as { id?: number };
        conn.write(serialize({ id: req.id, error: 'internal', message: String(err) }));
      }
    });

    conn.on('data', (chunk) => parser.feed(chunk.toString()));
    conn.on('error', () => {});
  });

  return new Promise<void>((resolve, reject) => {
    server!.on('error', reject);
    server!.listen(socketPath, () => resolve());
  });
}

export function stopSocketServer(): void {
  if (server) {
    server.close();
    server = null;
    if (activeSocketPath) {
      try {
        fs.unlinkSync(activeSocketPath);
      } catch {
        // Already removed
      }
      activeSocketPath = null;
    }
  }
}

