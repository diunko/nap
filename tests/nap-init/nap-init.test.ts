import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const CLI_PATH = path.join(__dirname, '../../out/cli/cli/nap.js');

function runInit(tmpdir: string, ...flags: string[]): { exitCode: number; stdout: string; stderr: string } {
  try {
    const result = execFileSync('node', [CLI_PATH, 'init', ...flags], {
      cwd: tmpdir,
      timeout: 10_000,
      env: { ...process.env, HOME: process.env['HOME'] },
    });
    return { exitCode: 0, stdout: result.toString(), stderr: '' };
  } catch (err: unknown) {
    const e = err as { stdout?: Buffer; stderr?: Buffer; status?: number };
    return {
      exitCode: e.status ?? 1,
      stdout: e.stdout?.toString() ?? '',
      stderr: e.stderr?.toString() ?? '',
    };
  }
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-init-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// T-1300-01: Happy path — full directory structure
describe('T-1300-01: Happy path — full directory structure', () => {
  test('creates all expected dirs and files', () => {
    const { exitCode } = runInit(tmpDir);
    expect(exitCode).toBe(0);

    const nap = path.join(tmpDir, '.nap');

    // Core files
    expect(fs.existsSync(path.join(nap, 'nap.db'))).toBe(true);
    expect(fs.existsSync(path.join(nap, '.gitignore'))).toBe(true);

    // 00-org docs
    expect(fs.existsSync(path.join(nap, '00-org', '10-promise.nap.md'))).toBe(true);
    expect(fs.existsSync(path.join(nap, '00-org', '20-workflow.nap.md'))).toBe(true);
    expect(fs.existsSync(path.join(nap, '00-org', '30-structure.nap.md'))).toBe(true);

    // 00-org roles
    expect(fs.existsSync(path.join(nap, '00-org', '40-roles', 'architect.md'))).toBe(true);
    expect(fs.existsSync(path.join(nap, '00-org', '40-roles', 'fullstack-eng.md'))).toBe(true);
    expect(fs.existsSync(path.join(nap, '00-org', '40-roles', 'test-architect.md'))).toBe(true);
    expect(fs.existsSync(path.join(nap, '00-org', '40-roles', 'test-eng.md'))).toBe(true);

    // nepics/01-v1 subdirs
    const v1 = path.join(nap, 'nepics', '01-v1');
    expect(fs.existsSync(path.join(v1, '10-docs'))).toBe(true);
    expect(fs.existsSync(path.join(v1, '15-feedback', 'issues.md'))).toBe(true);
    expect(fs.existsSync(path.join(v1, '15-feedback', 'wishlist.md'))).toBe(true);
    expect(fs.existsSync(path.join(v1, '20-architects', '001-architect', 'prompt.md'))).toBe(true);
    expect(fs.existsSync(path.join(v1, '30-napkins'))).toBe(true);
    expect(fs.existsSync(path.join(v1, '40-board', '20-backlog'))).toBe(true);
    expect(fs.existsSync(path.join(v1, '40-board', '30-todo'))).toBe(true);
    expect(fs.existsSync(path.join(v1, '40-board', '40-doing'))).toBe(true);
    expect(fs.existsSync(path.join(v1, '40-board', '50-review'))).toBe(true);
    expect(fs.existsSync(path.join(v1, '40-board', '60-done'))).toBe(true);
  });
});

// T-1300-02: Guard — fails if .nap/ exists
describe('T-1300-02: Guard — fails if .nap/ exists', () => {
  test('exits non-zero with "already initialized" when .nap/ exists', () => {
    const napDir = path.join(tmpDir, '.nap');
    fs.mkdirSync(napDir);
    fs.writeFileSync(path.join(napDir, 'marker'), 'do-not-touch');

    const { exitCode, stderr } = runInit(tmpDir);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('already initialized');

    // Nothing inside .nap/ modified
    expect(fs.readFileSync(path.join(napDir, 'marker'), 'utf-8')).toBe('do-not-touch');
    expect(fs.readdirSync(napDir)).toEqual(['marker']);
  });
});

// T-1300-03: SQLite — schema and seed data
describe('T-1300-03: SQLite — schema and seed data', () => {
  function query(dbPath: string, sql: string): string {
    return execFileSync('sqlite3', [dbPath, sql], { timeout: 5000 }).toString().trim();
  }

  test('tables exist: nepics, napkins, sessions, ui_state', () => {
    runInit(tmpDir);
    const dbPath = path.join(tmpDir, '.nap', 'nap.db');

    const tables = query(dbPath, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;");
    expect(tables).toContain('nepics');
    expect(tables).toContain('napkins');
    expect(tables).toContain('sessions');
    expect(tables).toContain('ui_state');
  });

  test('1 nepic row: name=v1, slug=01-v1, is_active=1', () => {
    runInit(tmpDir);
    const dbPath = path.join(tmpDir, '.nap', 'nap.db');

    const count = query(dbPath, "SELECT COUNT(*) FROM nepics;");
    expect(count).toBe('1');

    const name = query(dbPath, "SELECT name FROM nepics;");
    expect(name).toBe('v1');

    const slug = query(dbPath, "SELECT slug FROM nepics;");
    expect(slug).toBe('01-v1');

    const isActive = query(dbPath, "SELECT is_active FROM nepics;");
    expect(isActive).toBe('1');
  });

  test('1 session row: name=001-architect, role=architect, cc_session_uuid is UUID', () => {
    runInit(tmpDir);
    const dbPath = path.join(tmpDir, '.nap', 'nap.db');

    const count = query(dbPath, "SELECT COUNT(*) FROM sessions;");
    expect(count).toBe('1');

    const name = query(dbPath, "SELECT name FROM sessions;");
    expect(name).toBe('001-architect');

    const role = query(dbPath, "SELECT role FROM sessions;");
    expect(role).toBe('architect');

    const uuid = query(dbPath, "SELECT cc_session_uuid FROM sessions;");
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  test('session nepic_id matches nepic id', () => {
    runInit(tmpDir);
    const dbPath = path.join(tmpDir, '.nap', 'nap.db');

    const nepicId = query(dbPath, "SELECT id FROM nepics;");
    const sessionNepicId = query(dbPath, "SELECT nepic_id FROM sessions;");
    expect(sessionNepicId).toBe(nepicId);
  });
});

// T-1300-04: Skills flags
describe('T-1300-04: Skills flags', () => {
  test('no flags → .claude/skills/ does NOT exist', () => {
    runInit(tmpDir);
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'skills'))).toBe(false);
  });

  test('--add-skills → napkin and napkin-format in project .claude/skills/', () => {
    runInit(tmpDir, '--add-skills');

    const skillsDir = path.join(tmpDir, '.claude', 'skills');
    expect(fs.existsSync(path.join(skillsDir, 'napkin'))).toBe(true);
    expect(fs.existsSync(path.join(skillsDir, 'napkin-format'))).toBe(true);

    // Main skill files are non-empty
    const napkinSkill = fs.readFileSync(path.join(skillsDir, 'napkin', 'SKILL.md'), 'utf-8');
    expect(napkinSkill.length).toBeGreaterThan(0);

    const formatSkill = fs.readFileSync(path.join(skillsDir, 'napkin-format', 'SKILL.md'), 'utf-8');
    expect(formatSkill.length).toBeGreaterThan(0);
  });

  test('--add-skills --user → skills in $HOME/.claude/skills/, NOT in project', () => {
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-home-'));

    try {
      // Run with overridden HOME
      execFileSync('node', [CLI_PATH, 'init', '--add-skills', '--user'], {
        cwd: tmpDir,
        timeout: 10_000,
        env: { ...process.env, HOME: fakeHome },
      });

      // Skills in HOME
      const homeSkills = path.join(fakeHome, '.claude', 'skills');
      expect(fs.existsSync(path.join(homeSkills, 'napkin'))).toBe(true);
      expect(fs.existsSync(path.join(homeSkills, 'napkin-format'))).toBe(true);

      // NOT in project
      expect(fs.existsSync(path.join(tmpDir, '.claude', 'skills'))).toBe(false);
    } finally {
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });
});

// T-1300-05: nap open — fails without .nap/
describe('T-1300-05: nap open — fails without .nap/', () => {
  test('exits non-zero with "nap init" in stderr, no Electron spawned', () => {
    try {
      execFileSync('node', [CLI_PATH, 'open', tmpDir], {
        timeout: 5000,
        env: { ...process.env },
      });
      expect.unreachable('should have exited with code 1');
    } catch (err: unknown) {
      const e = err as { stdout?: Buffer; stderr?: Buffer; status?: number };
      expect(e.status).not.toBe(0);
      const stderr = e.stderr?.toString() ?? '';
      expect(stderr).toContain('nap init');
    }
  });
});
