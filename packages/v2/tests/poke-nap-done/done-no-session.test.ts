import { describe, test, expect } from 'vitest';
import { execSync } from 'child_process';
import * as path from 'path';
import * as os from 'os';

const CLI_PATH = path.join(__dirname, '../../out/cli/cli/nap.js');

// T-0400-08: nap done with no NAP_SESSION_ID errors cleanly
describe('T-0400-08: nap done with no NAP_SESSION_ID errors cleanly', () => {
  test('exits 1 with "not running inside nap" when NAP_SESSION_ID unset', () => {
    const env = { ...process.env };
    delete env['NAP_SESSION_ID'];
    env['NAP_SOCKET'] = path.join(os.tmpdir(), `nap-nosess-${Date.now()}.sock`);

    try {
      execSync(`node ${CLI_PATH} done "test"`, { env, timeout: 5000 });
      expect.unreachable('should have exited with code 1');
    } catch (err: unknown) {
      const e = err as { stdout?: Buffer; stderr?: Buffer; status?: number };
      expect(e.status).toBe(1);
      const stderr = e.stderr?.toString() ?? '';
      expect(stderr).toContain('not running inside nap');
    }
  });

  test('no socket connection attempted (no "nap is not running" error)', () => {
    // Use a non-existent socket path. If CLI tried to connect, it would get
    // ENOENT and print "nap is not running" instead of "not running inside nap".
    const env = { ...process.env };
    delete env['NAP_SESSION_ID'];
    env['NAP_SOCKET'] = path.join(os.tmpdir(), `nap-gone-${Date.now()}.sock`);

    try {
      execSync(`node ${CLI_PATH} done "test"`, { env, timeout: 5000 });
      expect.unreachable('should have exited with code 1');
    } catch (err: unknown) {
      const e = err as { stdout?: Buffer; stderr?: Buffer; status?: number };
      expect(e.status).toBe(1);
      const stderr = e.stderr?.toString() ?? '';
      expect(stderr).toContain('not running inside nap');
      expect(stderr).not.toContain('nap is not running');
    }
  });
});
