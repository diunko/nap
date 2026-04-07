import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFileSync } from 'child_process';

// --- Helpers ---

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'nap-setup-test-'));
}

const cliPath = path.join(__dirname, '..', 'out', 'cli', 'cli', 'nap.js');
const cliBuilt = fs.existsSync(cliPath);

function runNapInit(cwd: string, extraArgs: string[] = []): void {
  execFileSync('node', [cliPath, 'init', ...extraArgs], {
    cwd,
    timeout: 10000,
    encoding: 'utf8',
  });
}

function runNapSetup(
  cwd: string,
  args: string[],
): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execFileSync('node', [cliPath, 'setup', ...args], {
      cwd,
      timeout: 10000,
      encoding: 'utf8',
    }) as string;
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: (e.stdout as string) || '',
      stderr: (e.stderr as string) || '',
      exitCode: e.status || 1,
    };
  }
}

/**
 * Create a project directory structure for import testing.
 * Takes a record of relative paths (from project root) to content.
 * Paths ending in / create empty directories.
 * String values are written as-is. Objects are JSON-serialized.
 * null creates the parent dir only (directory marker).
 */
function createProjectFixture(
  tmpDir: string,
  files: Record<string, string | object | null>,
): void {
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = path.join(tmpDir, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    if (content === null) {
      // Directory marker — just ensure the dir exists
      if (relPath.endsWith('/')) {
        fs.mkdirSync(fullPath, { recursive: true });
      }
    } else if (typeof content === 'string') {
      fs.writeFileSync(fullPath, content);
    } else {
      fs.writeFileSync(fullPath, JSON.stringify(content, null, 2));
    }
  }
}

// --- Tests ---

describe.skipIf(!cliBuilt)('nap3 setup', () => {
  // T-0670-01
  it('setup without .nap/ → error', () => {
    const tmpDir = makeTmpDir();
    try {
      const result = runNapSetup(tmpDir, ['--guardian']);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('nap3 init');
      // No dirs created
      expect(fs.existsSync(path.join(tmpDir, '.nap'))).toBe(false);
      expect(fs.existsSync(path.join(tmpDir, '.claude'))).toBe(false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // T-0670-02
  it('setup --guardian creates guardian agent dir and marker', () => {
    const tmpDir = makeTmpDir();
    try {
      runNapInit(tmpDir);
      runNapSetup(tmpDir, ['--guardian']);

      const markerPath = path.join(tmpDir, '.nap', 'nepics', '01-v1', '20-architects', '002-guardian', '.agent.nap.json');
      expect(fs.existsSync(markerPath)).toBe(true);

      const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
      expect(marker.role).toBe('guardian');
      expect(marker.name).toBe('002-guardian');
      expect(marker.nepic).toBe('01-v1');
      expect(marker.started).toBe(false);
      expect(marker.cc_session_uuid).toMatch(/^[0-9a-f-]{36}$/);
      expect(typeof marker.created_at).toBe('number');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // T-0670-03
  it('setup --guardian copies prompt.md from template', () => {
    const tmpDir = makeTmpDir();
    try {
      runNapInit(tmpDir);
      runNapSetup(tmpDir, ['--guardian']);

      const promptPath = path.join(tmpDir, '.nap', 'nepics', '01-v1', '20-architects', '002-guardian', 'prompt.md');
      expect(fs.existsSync(promptPath)).toBe(true);
      expect(fs.readFileSync(promptPath, 'utf8').length).toBeGreaterThan(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // T-0670-04
  it('setup --guardian writes .claude/settings.json with hook config', () => {
    const tmpDir = makeTmpDir();
    try {
      runNapInit(tmpDir);
      runNapSetup(tmpDir, ['--guardian']);

      const settingsPath = path.join(tmpDir, '.claude', 'settings.json');
      expect(fs.existsSync(settingsPath)).toBe(true);
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      expect(settings.hooks.PermissionRequest[0].command).toBe('nap3 hook permission-request');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // T-0670-05
  it('setup --guardian merges into existing settings.json', () => {
    const tmpDir = makeTmpDir();
    try {
      runNapInit(tmpDir);

      // Pre-create settings.json with existing data
      const claudeDir = path.join(tmpDir, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });
      fs.writeFileSync(
        path.join(claudeDir, 'settings.json'),
        JSON.stringify({ permissions: { allow: ['Bash'] } }, null, 2),
      );

      runNapSetup(tmpDir, ['--guardian']);

      const settings = JSON.parse(fs.readFileSync(path.join(claudeDir, 'settings.json'), 'utf8'));
      expect(settings.permissions.allow).toContain('Bash');
      expect(settings.hooks.PermissionRequest).toBeDefined();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // T-0670-06
  it('setup --guardian idempotent — second run is no-op', () => {
    const tmpDir = makeTmpDir();
    try {
      runNapInit(tmpDir);
      runNapSetup(tmpDir, ['--guardian']);

      const markerPath = path.join(tmpDir, '.nap', 'nepics', '01-v1', '20-architects', '002-guardian', '.agent.nap.json');
      const markerBefore = JSON.parse(fs.readFileSync(markerPath, 'utf8'));

      const result = runNapSetup(tmpDir, ['--guardian']);
      expect(result.exitCode).toBe(0);

      const markerAfter = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
      expect(markerAfter.cc_session_uuid).toBe(markerBefore.cc_session_uuid);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // T-0670-07
  it('setup --skills copies napkin and napkin-format to .claude/skills/', () => {
    const tmpDir = makeTmpDir();
    try {
      runNapInit(tmpDir);
      runNapSetup(tmpDir, ['--skills']);

      const napkinDir = path.join(tmpDir, '.claude', 'skills', 'napkin');
      const napkinFormatDir = path.join(tmpDir, '.claude', 'skills', 'napkin-format');
      expect(fs.existsSync(napkinDir)).toBe(true);
      expect(fs.existsSync(napkinFormatDir)).toBe(true);
      expect(fs.readdirSync(napkinDir).length).toBeGreaterThan(0);
      expect(fs.readdirSync(napkinFormatDir).length).toBeGreaterThan(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // T-0670-08
  it('setup --skills overwrites existing skills (template update path)', () => {
    const tmpDir = makeTmpDir();
    try {
      runNapInit(tmpDir);
      runNapSetup(tmpDir, ['--skills']);

      // Plant a canary
      const canaryPath = path.join(tmpDir, '.claude', 'skills', 'napkin', 'canary.txt');
      fs.writeFileSync(canaryPath, 'canary');
      expect(fs.existsSync(canaryPath)).toBe(true);

      // Run again — canary should be gone
      runNapSetup(tmpDir, ['--skills']);
      expect(fs.existsSync(canaryPath)).toBe(false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // T-0670-10
  it('setup --import creates napkin markers for unmarked napkins', () => {
    const tmpDir = makeTmpDir();
    try {
      runNapInit(tmpDir);

      // Create an unmarked napkin dir
      const napkinDir = path.join(tmpDir, '.nap', 'nepics', '01-v1', '30-napkins', '0100-explore');
      fs.mkdirSync(napkinDir, { recursive: true });

      runNapSetup(tmpDir, ['--import']);

      const markerPath = path.join(napkinDir, '.napkin.nap.json');
      expect(fs.existsSync(markerPath)).toBe(true);
      const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
      expect(marker.status).toBe('backlog');
      expect(marker.nepic).toBe('01-v1');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // T-0670-11
  it('setup --import skips napkins that already have markers', () => {
    const tmpDir = makeTmpDir();
    try {
      runNapInit(tmpDir);

      // Create napkin with existing marker
      const napkinDir = path.join(tmpDir, '.nap', 'nepics', '01-v1', '30-napkins', '0100-explore');
      fs.mkdirSync(napkinDir, { recursive: true });
      fs.writeFileSync(
        path.join(napkinDir, '.napkin.nap.json'),
        JSON.stringify({ status: 'doing' }),
      );

      runNapSetup(tmpDir, ['--import']);

      const marker = JSON.parse(fs.readFileSync(path.join(napkinDir, '.napkin.nap.json'), 'utf8'));
      expect(marker.status).toBe('doing');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // T-0670-12
  it('setup --import creates agent markers with correct fields', () => {
    const tmpDir = makeTmpDir();
    try {
      runNapInit(tmpDir);

      // Create agent dir with prompt.md but no marker
      const agentDir = path.join(tmpDir, '.nap', 'nepics', '01-v1', '30-napkins', '0100-explore', 'agents', '001-test-arch');
      fs.mkdirSync(agentDir, { recursive: true });
      fs.writeFileSync(path.join(agentDir, 'prompt.md'), 'test prompt');

      // Also create the napkin dir
      const napkinDir = path.join(tmpDir, '.nap', 'nepics', '01-v1', '30-napkins', '0100-explore');
      // (already exists from agentDir creation)

      runNapSetup(tmpDir, ['--import']);

      const markerPath = path.join(agentDir, '.agent.nap.json');
      expect(fs.existsSync(markerPath)).toBe(true);
      const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));

      expect(marker.cc_session_uuid).toMatch(/^[0-9a-f-]{36}$/);
      expect(marker.role).toBe('test-arch');
      expect(marker.name).toBe('001-test-arch');
      expect(marker.napkin).toBe('0100-explore');
      expect(marker.nepic).toBe('01-v1');
      expect(marker.started).toBe(false);
      expect(marker.done).toBe(false);
      expect(marker.exited).toBe(false);
      expect(marker.archived).toBe(false);
      expect(typeof marker.created_at).toBe('number');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // T-0670-13
  it('setup --import role inference — strips leading digits + hyphen', () => {
    const tmpDir = makeTmpDir();
    try {
      runNapInit(tmpDir);

      const napkinDir = path.join(tmpDir, '.nap', 'nepics', '01-v1', '30-napkins', '0100-explore');
      const agentsBase = path.join(napkinDir, 'agents');

      for (const name of ['001-test-arch', '002-fs-eng', '003-reviewer']) {
        const dir = path.join(agentsBase, name);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'prompt.md'), 'test');
      }

      runNapSetup(tmpDir, ['--import']);

      const roles = ['001-test-arch', '002-fs-eng', '003-reviewer'].map(name => {
        const marker = JSON.parse(fs.readFileSync(path.join(agentsBase, name, '.agent.nap.json'), 'utf8'));
        return marker.role;
      });

      expect(roles).toEqual(['test-arch', 'fs-eng', 'reviewer']);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // T-0670-14
  it('setup --import detects done from response.md', () => {
    const tmpDir = makeTmpDir();
    try {
      runNapInit(tmpDir);

      const agentsBase = path.join(tmpDir, '.nap', 'nepics', '01-v1', '30-napkins', '0100-explore', 'agents');

      // Agent with response.md → done: true
      const doneDir = path.join(agentsBase, '001-done-agent');
      fs.mkdirSync(doneDir, { recursive: true });
      fs.writeFileSync(path.join(doneDir, 'prompt.md'), 'prompt');
      fs.writeFileSync(path.join(doneDir, 'response.md'), 'response');

      // Agent without response.md → done: false
      const notDoneDir = path.join(agentsBase, '002-wip-agent');
      fs.mkdirSync(notDoneDir, { recursive: true });
      fs.writeFileSync(path.join(notDoneDir, 'prompt.md'), 'prompt');

      runNapSetup(tmpDir, ['--import']);

      const doneMarker = JSON.parse(fs.readFileSync(path.join(doneDir, '.agent.nap.json'), 'utf8'));
      const wipMarker = JSON.parse(fs.readFileSync(path.join(notDoneDir, '.agent.nap.json'), 'utf8'));

      expect(doneMarker.done).toBe(true);
      expect(wipMarker.done).toBe(false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // T-0670-15
  it('setup --import skips empty agent dirs', () => {
    const tmpDir = makeTmpDir();
    try {
      runNapInit(tmpDir);

      const emptyDir = path.join(tmpDir, '.nap', 'nepics', '01-v1', '30-napkins', '0100-explore', 'agents', '001-empty');
      fs.mkdirSync(emptyDir, { recursive: true });

      runNapSetup(tmpDir, ['--import']);

      expect(fs.existsSync(path.join(emptyDir, '.agent.nap.json'))).toBe(false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // T-0670-16
  it('setup --import skips agents with existing markers', () => {
    const tmpDir = makeTmpDir();
    try {
      runNapInit(tmpDir);

      const agentDir = path.join(tmpDir, '.nap', 'nepics', '01-v1', '30-napkins', '0100-explore', 'agents', '001-test-arch');
      fs.mkdirSync(agentDir, { recursive: true });
      fs.writeFileSync(path.join(agentDir, 'prompt.md'), 'test');
      fs.writeFileSync(
        path.join(agentDir, '.agent.nap.json'),
        JSON.stringify({ cc_session_uuid: 'original-uuid' }),
      );

      runNapSetup(tmpDir, ['--import']);

      const marker = JSON.parse(fs.readFileSync(path.join(agentDir, '.agent.nap.json'), 'utf8'));
      expect(marker.cc_session_uuid).toBe('original-uuid');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // T-0670-17
  it('setup --import creates architect markers (no napkin field)', () => {
    const tmpDir = makeTmpDir();
    try {
      runNapInit(tmpDir);

      const archDir = path.join(tmpDir, '.nap', 'nepics', '01-v1', '20-architects', '003-new-arch');
      fs.mkdirSync(archDir, { recursive: true });
      fs.writeFileSync(path.join(archDir, 'prompt.md'), 'test');

      runNapSetup(tmpDir, ['--import']);

      const markerPath = path.join(archDir, '.agent.nap.json');
      expect(fs.existsSync(markerPath)).toBe(true);
      const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));

      expect(marker.napkin).toBeUndefined();
      expect(marker.role).toBe('new-arch');
      expect(marker.nepic).toBe('01-v1');
      expect(marker.cc_session_uuid).toMatch(/^[0-9a-f-]{36}$/);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // T-0670-18
  it('setup --import generates unique UUIDs per agent', () => {
    const tmpDir = makeTmpDir();
    try {
      runNapInit(tmpDir);

      const agentsBase = path.join(tmpDir, '.nap', 'nepics', '01-v1', '30-napkins', '0100-explore', 'agents');
      for (const name of ['001-a', '002-b', '003-c']) {
        const dir = path.join(agentsBase, name);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'prompt.md'), 'test');
      }

      runNapSetup(tmpDir, ['--import']);

      const uuids = ['001-a', '002-b', '003-c'].map(name => {
        const marker = JSON.parse(fs.readFileSync(path.join(agentsBase, name, '.agent.nap.json'), 'utf8'));
        return marker.cc_session_uuid;
      });
      expect(new Set(uuids).size).toBe(3);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // T-0670-19
  it('setup --import walks multiple nepics', () => {
    const tmpDir = makeTmpDir();
    try {
      runNapInit(tmpDir);

      // Create a second nepic with an unmarked napkin
      const nepic2Napkin = path.join(tmpDir, '.nap', 'nepics', '02-v2', '30-napkins', '0200-build');
      fs.mkdirSync(nepic2Napkin, { recursive: true });

      // Create unmarked napkin in first nepic
      const nepic1Napkin = path.join(tmpDir, '.nap', 'nepics', '01-v1', '30-napkins', '0100-explore');
      fs.mkdirSync(nepic1Napkin, { recursive: true });

      runNapSetup(tmpDir, ['--import']);

      const v1Marker = JSON.parse(fs.readFileSync(path.join(nepic1Napkin, '.napkin.nap.json'), 'utf8'));
      const v2Marker = JSON.parse(fs.readFileSync(path.join(nepic2Napkin, '.napkin.nap.json'), 'utf8'));
      expect(v1Marker.nepic).toBe('01-v1');
      expect(v2Marker.nepic).toBe('02-v2');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // T-0670-20
  it('setup --import never deletes files', () => {
    const tmpDir = makeTmpDir();
    try {
      runNapInit(tmpDir);

      const agentDir = path.join(tmpDir, '.nap', 'nepics', '01-v1', '30-napkins', '0100-explore', 'agents', '001-test-arch');
      fs.mkdirSync(agentDir, { recursive: true });
      fs.writeFileSync(path.join(agentDir, 'prompt.md'), 'test');
      const strayPath = path.join(agentDir, 'scratch.md');
      fs.writeFileSync(strayPath, 'stray content');

      runNapSetup(tmpDir, ['--import']);

      expect(fs.existsSync(strayPath)).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // T-0670-21
  it('combined flags — --guardian --skills --import in one call', () => {
    const tmpDir = makeTmpDir();
    try {
      runNapInit(tmpDir);

      // Create an unmarked agent
      const agentDir = path.join(tmpDir, '.nap', 'nepics', '01-v1', '30-napkins', '0100-explore', 'agents', '001-test-arch');
      fs.mkdirSync(agentDir, { recursive: true });
      fs.writeFileSync(path.join(agentDir, 'prompt.md'), 'test');

      runNapSetup(tmpDir, ['--guardian', '--skills', '--import']);

      // Guardian created
      expect(fs.existsSync(path.join(tmpDir, '.nap', 'nepics', '01-v1', '20-architects', '002-guardian', '.agent.nap.json'))).toBe(true);
      // Skills copied
      expect(fs.existsSync(path.join(tmpDir, '.claude', 'skills', 'napkin'))).toBe(true);
      // Agent imported
      expect(fs.existsSync(path.join(agentDir, '.agent.nap.json'))).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // T-0670-22
  it('setup with no flags → exits with usage', () => {
    const tmpDir = makeTmpDir();
    try {
      runNapInit(tmpDir);
      const result = runNapSetup(tmpDir, []);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('--guardian');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // T-0670-23
  it('setup --import handles agent dir with only response.md', () => {
    const tmpDir = makeTmpDir();
    try {
      runNapInit(tmpDir);

      const agentDir = path.join(tmpDir, '.nap', 'nepics', '01-v1', '30-napkins', '0100-explore', 'agents', '001-responder');
      fs.mkdirSync(agentDir, { recursive: true });
      fs.writeFileSync(path.join(agentDir, 'response.md'), 'done');

      runNapSetup(tmpDir, ['--import']);

      const markerPath = path.join(agentDir, '.agent.nap.json');
      expect(fs.existsSync(markerPath)).toBe(true);
      const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
      expect(marker.done).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // T-0670-24
  it('init --guardian uses same logic as setup --guardian', () => {
    const tmpDir1 = makeTmpDir();
    const tmpDir2 = makeTmpDir();
    try {
      // Path 1: init --guardian
      runNapInit(tmpDir1, ['--guardian']);

      // Path 2: init → setup --guardian
      runNapInit(tmpDir2);
      runNapSetup(tmpDir2, ['--guardian']);

      const marker1 = JSON.parse(fs.readFileSync(
        path.join(tmpDir1, '.nap', 'nepics', '01-v1', '20-architects', '002-guardian', '.agent.nap.json'), 'utf8',
      ));
      const marker2 = JSON.parse(fs.readFileSync(
        path.join(tmpDir2, '.nap', 'nepics', '01-v1', '20-architects', '002-guardian', '.agent.nap.json'), 'utf8',
      ));

      // Same structure (different UUIDs and timestamps, but same fields)
      expect(Object.keys(marker1).sort()).toEqual(Object.keys(marker2).sort());
      expect(marker1.role).toBe(marker2.role);
      expect(marker1.name).toBe(marker2.name);
      expect(marker1.nepic).toBe(marker2.nepic);
      expect(marker1.started).toBe(marker2.started);

      // Settings.json has same hook structure
      const settings1 = JSON.parse(fs.readFileSync(path.join(tmpDir1, '.claude', 'settings.json'), 'utf8'));
      const settings2 = JSON.parse(fs.readFileSync(path.join(tmpDir2, '.claude', 'settings.json'), 'utf8'));
      expect(settings1.hooks.PermissionRequest).toEqual(settings2.hooks.PermissionRequest);
    } finally {
      fs.rmSync(tmpDir1, { recursive: true, force: true });
      fs.rmSync(tmpDir2, { recursive: true, force: true });
    }
  });

  // T-0670-25
  it('setup --guardian on multi-nepic project uses active nepic', () => {
    const tmpDir = makeTmpDir();
    try {
      runNapInit(tmpDir);

      // Create second nepic and set it as active
      const nepic2Dir = path.join(tmpDir, '.nap', 'nepics', '02-v2', '20-architects');
      fs.mkdirSync(nepic2Dir, { recursive: true });
      fs.mkdirSync(path.join(tmpDir, '.nap', 'nepics', '02-v2', '30-napkins'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, '.nap', 'ui-state.json'),
        JSON.stringify({ activeNepicId: '02-v2' }),
      );

      runNapSetup(tmpDir, ['--guardian']);

      // Guardian should be in 02-v2, not 01-v1
      expect(fs.existsSync(path.join(tmpDir, '.nap', 'nepics', '02-v2', '20-architects', '002-guardian', '.agent.nap.json'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, '.nap', 'nepics', '01-v1', '20-architects', '002-guardian', '.agent.nap.json'))).toBe(false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // T-0670-26
  it('setup --import role inference edge case — no numeric prefix', () => {
    const tmpDir = makeTmpDir();
    try {
      runNapInit(tmpDir);

      const agentDir = path.join(tmpDir, '.nap', 'nepics', '01-v1', '30-napkins', '0100-explore', 'agents', 'custom-agent');
      fs.mkdirSync(agentDir, { recursive: true });
      fs.writeFileSync(path.join(agentDir, 'prompt.md'), 'test');

      runNapSetup(tmpDir, ['--import']);

      const marker = JSON.parse(fs.readFileSync(path.join(agentDir, '.agent.nap.json'), 'utf8'));
      expect(marker.role).toBe('custom-agent');
      expect(typeof marker.role).toBe('string');
      expect(marker.role.length).toBeGreaterThan(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // T-0670-29
  it('setup --import with deeply nested nepic structure', () => {
    const tmpDir = makeTmpDir();
    try {
      runNapInit(tmpDir);

      const agentDir = path.join(
        tmpDir, '.nap', 'nepics', '03-nepic-spaces-v2',
        '30-napkins', '0670-setup-command', 'agents', '001-test-arch-setup',
      );
      fs.mkdirSync(agentDir, { recursive: true });
      fs.writeFileSync(path.join(agentDir, 'prompt.md'), 'test');

      runNapSetup(tmpDir, ['--import']);

      const marker = JSON.parse(fs.readFileSync(path.join(agentDir, '.agent.nap.json'), 'utf8'));
      expect(marker.napkin).toBe('0670-setup-command');
      expect(marker.nepic).toBe('03-nepic-spaces-v2');
      expect(marker.name).toBe('001-test-arch-setup');
      expect(marker.role).toBe('test-arch-setup');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // T-0670-30
  it('setup --import markers have valid created_at timestamps', () => {
    const tmpDir = makeTmpDir();
    try {
      runNapInit(tmpDir);

      const agentsBase = path.join(tmpDir, '.nap', 'nepics', '01-v1', '30-napkins', '0100-explore', 'agents');
      for (const name of ['001-a', '002-b', '003-c', '004-d', '005-e']) {
        const dir = path.join(agentsBase, name);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'prompt.md'), 'test');
      }

      const beforeMs = Date.now();
      runNapSetup(tmpDir, ['--import']);
      const afterMs = Date.now();

      const timestamps = ['001-a', '002-b', '003-c', '004-d', '005-e'].map(name => {
        const marker = JSON.parse(fs.readFileSync(path.join(agentsBase, name, '.agent.nap.json'), 'utf8'));
        return marker.created_at;
      });

      for (const ts of timestamps) {
        expect(ts).toBeGreaterThanOrEqual(beforeMs);
        expect(ts).toBeLessThanOrEqual(afterMs + 1000);
      }

      // Monotonically ordered or equal
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
