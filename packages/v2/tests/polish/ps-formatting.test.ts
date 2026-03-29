import { describe, test, expect, afterEach } from 'vitest';
import { execSync, spawn } from 'child_process';
import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { NdjsonParser, serialize } from '../../src/shared/ndjson';

const CLI_PATH = path.join(__dirname, '../../out/cli/cli/nap.js');

// ---------------------------------------------------------------------------
// Sync runner — for tests that don't need a live socket server
// ---------------------------------------------------------------------------

function runCli(args: string): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(`node ${CLI_PATH} ${args}`, {
      timeout: 5000,
    }).toString();
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: Buffer; stderr?: Buffer; status?: number };
    return {
      stdout: e.stdout?.toString() ?? '',
      stderr: e.stderr?.toString() ?? '',
      exitCode: e.status ?? 1,
    };
  }
}

// ---------------------------------------------------------------------------
// Async runner — for tests that need the event loop free for a socket server
// ---------------------------------------------------------------------------

function runCliAsync(
  args: string[],
  socketPath: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = spawn('node', [CLI_PATH, ...args], {
      env: { ...process.env, NAP_SOCKET: socketPath },
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    const timer = setTimeout(() => proc.kill(), 5000);
    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });
  });
}

// ---------------------------------------------------------------------------
// Mini socket server that responds to `ps` requests
// ---------------------------------------------------------------------------

interface TestServer {
  socketPath: string;
  stop: () => void;
}

function startPsServer(sessions: Record<string, unknown>[]): Promise<TestServer> {
  const socketPath = path.join(
    os.tmpdir(),
    `nap-ps-test-${Date.now()}-${Math.random().toString(36).slice(2)}.sock`,
  );

  return new Promise((resolve, reject) => {
    const server = net.createServer((conn) => {
      const parser = new NdjsonParser((msg: any) => {
        if (msg.type === 'ps') {
          conn.write(serialize({ id: msg.id, ok: true, sessions }));
        }
      });
      conn.on('data', (chunk: Buffer) => parser.feed(chunk.toString()));
      conn.on('error', () => {});
    });

    server.on('error', reject);
    server.listen(socketPath, () => {
      resolve({
        socketPath,
        stop: () => {
          server.close();
          try { fs.unlinkSync(socketPath); } catch { /* ok */ }
        },
      });
    });
  });
}

const servers: TestServer[] = [];

afterEach(() => {
  for (const s of servers) s.stop();
  servers.length = 0;
});

// =========================================================================
// T-0600-05: nap --help prints all commands
// =========================================================================
describe('T-0600-05: nap --help prints all commands', () => {
  test('lists every command name and exits 0', () => {
    const result = runCli('--help');
    expect(result.exitCode).toBe(0);
    for (const cmd of ['open', 'start', 'ps', 'log', 'peek', 'kill', 'close', 'poke', 'nap', 'done']) {
      expect(result.stdout).toContain(cmd);
    }
  });
});

// =========================================================================
// T-0600-06: nap with no args shows help
// =========================================================================
describe('T-0600-06: nap with no args shows help', () => {
  test('identical output to nap --help, no socket connection error', () => {
    const helpResult = runCli('--help');
    const noArgs = runCli('');
    expect(noArgs.stdout).toBe(helpResult.stdout);
    expect(noArgs.exitCode).toBe(0);
    expect(noArgs.stderr).not.toContain('nap is not running');
  });
});

// =========================================================================
// T-0600-07: nap <command> --help prints command usage
// =========================================================================
describe('T-0600-07: nap <command> --help prints command usage', () => {
  test('nap start --help shows --name and --cwd', () => {
    const result = runCli('start --help');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('start');
    expect(result.stdout).toContain('--name');
    expect(result.stdout).toContain('--cwd');
  });

  test('nap ps --help shows --json', () => {
    const result = runCli('ps --help');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('--json');
  });

  test('nap log --help shows name parameter', () => {
    const result = runCli('log --help');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('name');
  });
});

// =========================================================================
// T-0600-15 (partial): nap ps --json has no ANSI escape codes
// =========================================================================
describe('T-0600-15 (partial): nap ps --json has no ANSI escape codes', () => {
  test('output is valid JSON with no ANSI sequences', async () => {
    const sessions = [
      { id: '1', name: 'runner', status: 'running', parent: '-', cwd: '/tmp', uptime: '5s' },
      { id: '2', name: 'stopped', status: 'exited', parent: '-', cwd: '/tmp', uptime: '10s' },
      { id: '3', name: 'finished', status: 'done', parent: 'runner', cwd: '/tmp', uptime: '8s' },
    ];
    const server = await startPsServer(sessions);
    servers.push(server);

    const result = await runCliAsync(['ps', '--json'], server.socketPath);
    expect(result.exitCode).toBe(0);
    // No ANSI escape sequences
    expect(result.stdout).not.toMatch(/\x1b\[/);
    // Valid JSON
    const parsed = JSON.parse(result.stdout);
    expect(parsed).toHaveLength(3);
    // Status fields are plain strings
    for (const s of parsed) {
      expect(s.status).not.toMatch(/\x1b/);
    }
  });
});

// =========================================================================
// T-0600-16: nap ps table columns aligned
// =========================================================================
describe('T-0600-16: nap ps table columns are aligned', () => {
  test('column positions consistent across rows with varying name lengths', async () => {
    const sessions = [
      { id: '1', name: 'a', status: 'running', parent: '-', cwd: '/tmp', uptime: '5s' },
      { id: '2', name: 'very-long-session-name', status: 'exited', parent: '-', cwd: '/tmp/deep/path', uptime: '1h' },
      { id: '3', name: 'mid', status: 'done', parent: 'a', cwd: '/tmp', uptime: '30m' },
    ];
    const server = await startPsServer(sessions);
    servers.push(server);

    const result = await runCliAsync(['ps'], server.socketPath);
    expect(result.exitCode).toBe(0);

    const lines = result.stdout.split('\n').filter((l) => l.trim());
    expect(lines.length).toBeGreaterThanOrEqual(4); // header + 3 rows

    // Strip ANSI codes for position measurement
    const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');
    const stripped = lines.map(strip);

    // STATUS column header position
    const headerStatusPos = stripped[0].indexOf('STATUS');
    expect(headerStatusPos).toBeGreaterThan(0);

    // Each data row's status dot (●) should start at the same column
    for (let i = 1; i < stripped.length; i++) {
      const dotPos = stripped[i].indexOf('\u25cf'); // ● character
      if (dotPos >= 0) {
        expect(dotPos).toBe(headerStatusPos);
      }
    }
  });
});
