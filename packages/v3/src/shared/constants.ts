import * as net from 'net';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

/**
 * Resolve the socket path for the Electron app (server side).
 * Uses NAP_SOCKET env var, or --cwd flag, or process.cwd().
 */
export function getServerSocketPath(cwd?: string): string {
  if (process.env['NAP_SOCKET']) return process.env['NAP_SOCKET'];
  const dir = cwd || process.cwd();
  return path.join(dir, '.nap', 'sock');
}

/**
 * Walk up from `startDir` looking for `.nap/sock`.
 * Returns the socket path if found, null otherwise.
 */
export function findSocketPath(startDir: string): string | null {
  let dir = path.resolve(startDir);
  while (true) {
    const candidate = path.join(dir, '.nap', 'sock');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break; // filesystem root
    dir = parent;
  }
  return null;
}

/**
 * Check if a socket is live (accepts connections).
 */
export function isSocketAlive(socketPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const conn = net.createConnection(socketPath);
    conn.on('connect', () => {
      conn.destroy();
      resolve(true);
    });
    conn.on('error', () => resolve(false));
  });
}

/**
 * Walk up from `startDir` looking for a `.nap/` directory.
 * Returns the project root (parent of .nap/) if found, null otherwise.
 */
export function findProjectRoot(startDir: string): string | null {
  let dir = path.resolve(startDir);
  while (true) {
    const candidate = path.join(dir, '.nap');
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break; // filesystem root
    dir = parent;
  }
  return null;
}

// Legacy compat — used by tests that set NAP_SOCKET env var
export const SOCKET_PATH =
  process.env['NAP_SOCKET'] || path.join(os.homedir(), '.nap', 'sock');
