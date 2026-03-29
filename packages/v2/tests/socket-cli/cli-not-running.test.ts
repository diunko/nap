import { describe, test, expect } from 'vitest';
import { execSync, spawnSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const CLI_PATH = path.join(__dirname, '../../out/cli/cli/nap.js');

function runCli(
  args: string,
  socketPath: string,
): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(`node ${CLI_PATH} ${args}`, {
      env: { ...process.env, NAP_SOCKET: socketPath },
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

// T-0300-08: CLI behavior when app is not running
describe('T-0300-08: CLI behavior when app is not running', () => {
  test('ENOENT: no socket file → "nap is not running" exit 1', () => {
    const socketPath = path.join(os.tmpdir(), `nap-test-missing-${Date.now()}.sock`);
    try { fs.unlinkSync(socketPath); } catch { /* ok */ }

    const result = runCli('ps', socketPath);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('nap is not running');
    expect(result.stderr).not.toContain('Error:');
    expect(result.stderr).not.toContain('at ');
  });

  test('ECONNREFUSED: stale unix socket (killed server) → "nap is not running" exit 1', () => {
    const socketPath = path.join(os.tmpdir(), `nap-test-stale-${Date.now()}.sock`);

    // Spawn a child that creates a listening unix socket server.
    // spawnSync with a 1s timeout kills it via SIGTERM, leaving the socket file.
    spawnSync('node', [
      '-e',
      [
        `const net = require('net');`,
        `const s = net.createServer();`,
        `s.listen('${socketPath}', () => setTimeout(() => {}, 60000));`,
      ].join(' '),
    ], { timeout: 1000 });

    if (!fs.existsSync(socketPath)) {
      // OS cleaned up the socket file on SIGTERM — can't test ECONNREFUSED.
      // This is platform-dependent; on macOS node may clean up on SIGTERM.
      console.log('Socket file cleaned up by OS after SIGTERM — skipping ECONNREFUSED test');
      return;
    }

    try {
      const result = runCli('ps', socketPath);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('nap is not running');
      expect(result.stderr).not.toContain('at ');
    } finally {
      try { fs.unlinkSync(socketPath); } catch { /* ok */ }
    }
  });

  test('ENOTSOCK: regular file at socket path → unhandled (known gap in CLI)', () => {
    const socketPath = path.join(os.tmpdir(), `nap-test-notsock-${Date.now()}.sock`);
    fs.writeFileSync(socketPath, '');

    try {
      const result = runCli('ps', socketPath);

      // CLI only handles ENOENT and ECONNREFUSED.
      // A regular file at the socket path gives ENOTSOCK, which falls through
      // to the generic catch → raw error message instead of "nap is not running".
      expect(result.exitCode).toBe(1);
    } finally {
      try { fs.unlinkSync(socketPath); } catch { /* ok */ }
    }
  });

  test('clean error for all commands when not running', () => {
    const socketPath = path.join(os.tmpdir(), `nap-test-cmds-${Date.now()}.sock`);
    try { fs.unlinkSync(socketPath); } catch { /* ok */ }

    for (const cmd of ['ps', 'start "echo hi"', 'peek test', 'kill test', 'close test']) {
      const result = runCli(cmd, socketPath);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('nap is not running');
    }
  });
});
