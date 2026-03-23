#!/usr/bin/env node

import * as net from 'net';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { spawn, execFileSync } from 'child_process';
import * as crypto from 'crypto';
import { NdjsonParser, serialize } from '../shared/ndjson';
import { findSocketPath, isSocketAlive } from '../shared/constants';

// --- Help text ---

const HELP_TEXT = `nap — Napkin Agent Protocol

Usage: nap <command> [options]

Commands:
  init              Bootstrap a project for agent collaboration
  open [path]       Launch Nap.app for a project directory
  start <command>   Start a new agent session
  ps                List all sessions
  status <slug> <s> Set napkin status (backlog/todo/doing/review/done)
  log <name>        Dump terminal scrollback to stdout
  peek <name>       Focus a terminal in the UI
  kill <name>       Kill a session's process
  close <name>      Close a session (kill + remove)
  poke <name> <msg> Send input to a running session
  nap <name>        Wait for a session to complete
  done [message]    Mark current session as done

Flags:
  --help            Show help
`;

const COMMAND_HELP: Record<string, string> = {
  init: `Usage: nap init [--name <name>] [--add-skills [--user]]

Bootstrap a project for agent collaboration.

  --name <name>     Project name (default: cwd basename)
  --add-skills      Copy napkin skills to .claude/skills/
  --user            With --add-skills: install to ~/.claude/skills/ instead
  --help            Show this help
`,
  open: `Usage: nap open [path] [--architect] [--name <name>] [--command <cmd>]

Launch Nap.app for a project directory.

  path              Project directory (default: .)
  -a, --architect   Launch with architect Claude session as first terminal
  --name <name>     Display name for architect terminal (default: shell)
  --command <cmd>   Command to run in the first terminal (default: login shell)
  --help            Show this help

Environment:
  NAP_APP_PATH      Path to nap-app directory (default: ~/nap-app)
`,
  start: `Usage: nap start <command> [--name <name>] [--cwd <path>]

Start a new agent session.

  command           Shell command to run
  --name <name>     Session name (default: agent-N)
  --cwd <path>      Working directory (default: project cwd)
  --help            Show this help
`,
  ps: `Usage: nap ps [--json]

List all sessions.

  --json            Output raw JSON (no colors, no table)
  --help            Show this help
`,
  log: `Usage: nap log <name>

Dump terminal scrollback to stdout.

  name              Session name
  --help            Show this help
`,
  peek: `Usage: nap peek <name>

Focus a terminal in the UI.

  name              Session name
  --help            Show this help
`,
  kill: `Usage: nap kill <name>

Kill a session's process.

  name              Session name
  --help            Show this help
`,
  close: `Usage: nap close <name>

Close a session (kill + remove from list).

  name              Session name
  --help            Show this help
`,
  poke: `Usage: nap poke <name> <message>

Send input to a running session.

  name              Session name
  message           Text to send
  --help            Show this help
`,
  nap: `Usage: nap nap <name> [--timeout <seconds>]

Wait for a session to complete.

  name              Session name
  --timeout <secs>  Max wait time (default: 600)
  --help            Show this help
`,
  done: `Usage: nap done [message]

Mark the current session as done (must be running inside nap).

  message           Optional done message
  --help            Show this help
`,
  status: `Usage: nap status <napkin-slug> <status>

Set napkin status (updates SQLite and board symlinks).

  napkin-slug       Napkin slug (e.g. 0200-sqlite-setup)
  status            One of: backlog, todo, doing, review, done
  --help            Show this help
`,
};

// --- Arg parsing ---

function parseArgs(argv: string[]): {
  command: string;
  args: string[];
  flags: Record<string, string | boolean>;
} {
  // Check for top-level --help before any command
  if (argv.length === 0 || argv[0] === '--help') {
    return { command: 'help', args: [], flags: {} };
  }

  const command = argv[0];
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-a') {
      flags['architect'] = true;
    } else if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }

  return { command, args: positional, flags };
}

// --- Socket communication ---

function send(
  socketPath: string,
  request: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const conn = net.createConnection(socketPath);

    conn.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT' || err.code === 'ECONNREFUSED') {
        process.stderr.write('nap is not running\n');
        process.exit(1);
      }
      reject(err);
    });

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

function resolveSocketOrDie(): string {
  // Allow NAP_SOCKET env override for testing
  if (process.env['NAP_SOCKET']) return process.env['NAP_SOCKET'];

  const found = findSocketPath(process.cwd());
  if (!found) {
    process.stderr.write('no nap project found (run `nap open` in a project directory)\n');
    process.exit(1);
  }
  return found;
}

// --- Formatting ---

interface SessionRow {
  id: string;
  name: string;
  status: string;
  parent: string;
  cwd: string;
  uptime: string;
}

const STATUS_COLORS: Record<string, string> = {
  running: '\x1b[32m',
  exited: '\x1b[90m',
  done: '\x1b[34m',
};
const RESET = '\x1b[0m';

function coloredStatus(status: string): string {
  const color = STATUS_COLORS[status] || '';
  return `${color}\u25cf${RESET} ${status}`;
}

function printTable(header: string[], rows: string[][], displayRows?: string[][]): void {
  // Use displayRows for visual width calc if provided (for ANSI-colored strings)
  const measureRows = displayRows || rows;
  const widths = header.map((h, i) => {
    const colValues = [h, ...measureRows.map((r) => r[i] || '')];
    return Math.max(...colValues.map((v) => v.length));
  });

  const formatRow = (row: string[], measure: string[]) =>
    row.map((cell, i) => cell + ' '.repeat(Math.max(0, widths[i] - measure[i].length))).join('  ');

  process.stdout.write(formatRow(header, header) + '\n');
  for (let r = 0; r < rows.length; r++) {
    process.stdout.write(formatRow(rows[r], measureRows[r]) + '\n');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Template helpers ---

function findTemplatesDir(): string {
  // Built CLI: out/cli/cli/nap.js → ../../../src/templates
  const fromBuilt = path.resolve(__dirname, '..', '..', '..', 'src', 'templates');
  if (fs.existsSync(fromBuilt)) return fromBuilt;
  // Running from source: src/cli/nap.ts → ../templates
  const fromSource = path.resolve(__dirname, '..', 'templates');
  if (fs.existsSync(fromSource)) return fromSource;
  throw new Error('templates directory not found');
}

function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS nepics (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS napkins (
  id TEXT PRIMARY KEY,
  nepic_id TEXT NOT NULL REFERENCES nepics(id),
  slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'backlog',
  created_at INTEGER NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  nepic_id TEXT REFERENCES nepics(id),
  napkin_slug TEXT,
  name TEXT NOT NULL,
  role TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  cc_session_uuid TEXT,
  parent_id TEXT REFERENCES sessions(id),
  command TEXT,
  cwd TEXT,
  done_message TEXT,
  created_at INTEGER NOT NULL,
  exited_at INTEGER,
  hidden INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ui_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  active_nepic_id TEXT,
  active_terminal_id TEXT,
  sidebar_visible INTEGER NOT NULL DEFAULT 1
);
`;

// --- Main ---

async function main(): Promise<void> {
  const { command, args, flags } = parseArgs(process.argv.slice(2));
  let requestId = 1;

  // Handle --help for any command
  if (flags['help'] && command !== 'help') {
    const helpText = COMMAND_HELP[command];
    if (helpText) {
      process.stdout.write(helpText);
      process.exit(0);
    }
    // Unknown command with --help falls through to generic help
    process.stdout.write(HELP_TEXT);
    process.exit(0);
  }

  switch (command) {
    case 'help': {
      process.stdout.write(HELP_TEXT);
      process.exit(0);
      break;
    }

    case 'init': {
      const cwd = process.cwd();
      const napDir = path.join(cwd, '.nap');

      if (fs.existsSync(napDir)) {
        process.stderr.write('Project already initialized. Run `nap open` to launch.\n');
        process.exit(1);
      }

      const templatesDir = findTemplatesDir();

      // Create .nap/ directory
      fs.mkdirSync(napDir, { recursive: true });

      // Copy 00-org/ from templates
      copyDirRecursive(
        path.join(templatesDir, '00-org'),
        path.join(napDir, '00-org'),
      );

      // Create nepics/01-v1/ structure
      const nepicDir = path.join(napDir, 'nepics', '01-v1');

      // Copy nepic template dirs (15-feedback, 20-architects)
      copyDirRecursive(
        path.join(templatesDir, 'nepic'),
        nepicDir,
      );

      // Create empty dirs
      fs.mkdirSync(path.join(nepicDir, '10-docs'), { recursive: true });
      fs.mkdirSync(path.join(nepicDir, '30-napkins'), { recursive: true });
      fs.mkdirSync(path.join(nepicDir, '40-board', '20-backlog'), { recursive: true });
      fs.mkdirSync(path.join(nepicDir, '40-board', '30-todo'), { recursive: true });
      fs.mkdirSync(path.join(nepicDir, '40-board', '40-doing'), { recursive: true });
      fs.mkdirSync(path.join(nepicDir, '40-board', '50-review'), { recursive: true });
      fs.mkdirSync(path.join(nepicDir, '40-board', '60-done'), { recursive: true });

      // Create .gitignore
      fs.writeFileSync(
        path.join(napDir, '.gitignore'),
        'nap.db\nnap.db-shm\nnap.db-wal\nsock\n',
      );

      // Create nap.db via sqlite3 CLI
      const nepicId = crypto.randomUUID();
      const sessionId = crypto.randomUUID();
      const ccSessionUuid = crypto.randomUUID();
      const now = Date.now();

      const sql = SCHEMA_SQL + `
INSERT INTO nepics (id, name, slug, created_at, is_active)
  VALUES ('${nepicId}', 'v1', '01-v1', ${now}, 1);

INSERT INTO sessions (id, nepic_id, name, role, status, cc_session_uuid, created_at)
  VALUES ('${sessionId}', '${nepicId}', '001-architect', 'architect', 'new', '${ccSessionUuid}', ${now});
`;

      const dbPath = path.join(napDir, 'nap.db');
      execFileSync('sqlite3', [dbPath], { input: sql });

      // Handle --add-skills
      if (flags['add-skills']) {
        const skillsSrc = path.join(templatesDir, 'skills');
        let skillsDest: string;
        if (flags['user']) {
          skillsDest = path.join(os.homedir(), '.claude', 'skills');
        } else {
          skillsDest = path.join(cwd, '.claude', 'skills');
        }

        copyDirRecursive(
          path.join(skillsSrc, 'napkin'),
          path.join(skillsDest, 'napkin'),
        );
        copyDirRecursive(
          path.join(skillsSrc, 'napkin-format'),
          path.join(skillsDest, 'napkin-format'),
        );
      }

      process.stdout.write('Initialized NAP project in .nap/\n');
      break;
    }

    case 'open': {
      const rawPath = args[0] || '.';
      const resolvedPath = path.resolve(process.cwd(), rawPath);

      // Guard: fail if no .nap/ directory
      const napCheck = path.join(resolvedPath, '.nap');
      if (!fs.existsSync(napCheck)) {
        process.stderr.write('No .nap/ directory found. Run `nap init` first.\n');
        process.exit(1);
      }

      // Check if already running
      const candidateSocket = path.join(resolvedPath, '.nap', 'sock');
      if (fs.existsSync(candidateSocket)) {
        const alive = await isSocketAlive(candidateSocket);
        if (alive) {
          process.stderr.write('nap is already running in this project\n');
          process.exit(1);
        }
      }

      // Find electron binary
      const napAppPath =
        process.env['NAP_APP_PATH'] || path.join(os.homedir(), 'nap-app');
      const electronBin = path.join(napAppPath, 'node_modules', '.bin', 'electron');
      const mainScript = path.join(napAppPath, 'out', 'main', 'main.js');

      if (!fs.existsSync(electronBin)) {
        process.stderr.write(`electron not found at ${electronBin}\n`);
        process.stderr.write('set NAP_APP_PATH to your nap-app directory\n');
        process.exit(1);
      }

      // Spawn detached
      const electronArgs = [mainScript, '--cwd', resolvedPath];
      if (flags['name'] && typeof flags['name'] === 'string') {
        electronArgs.push('--name', flags['name']);
      }
      if (flags['command'] && typeof flags['command'] === 'string') {
        electronArgs.push('--command', flags['command']);
      }
      if (flags['architect']) {
        electronArgs.push('--architect');
      }
      const child = spawn(electronBin, electronArgs, {
        detached: true,
        stdio: 'ignore',
        cwd: resolvedPath,
      });
      child.unref();
      break;
    }

    case 'start': {
      if (!args[0]) {
        process.stderr.write('Usage: nap start <command> [--name <name>] [--cwd <path>] [--napkin <slug>]\n');
        process.exit(1);
      }
      const sock = resolveSocketOrDie();
      const res = await send(sock, {
        type: 'start',
        id: requestId++,
        command: args[0],
        name: flags['name'] || undefined,
        cwd: (flags['cwd'] as string) || process.cwd(),
        parentId: process.env['NAP_SESSION_ID'] || null,
        napkinSlug: (flags['napkin'] as string) || undefined,
      });
      if (res['error']) {
        process.stderr.write(String(res['message']) + '\n');
        process.exit(1);
      }
      process.stdout.write(JSON.stringify({ id: res['sessionId'], name: res['name'] }) + '\n');
      break;
    }

    case 'ps': {
      const sock = resolveSocketOrDie();
      const res = await send(sock, { type: 'ps', id: requestId++ });
      if (res['error']) {
        process.stderr.write(String(res['message']) + '\n');
        process.exit(1);
      }
      const sessions = res['sessions'] as SessionRow[];

      if (flags['json']) {
        process.stdout.write(JSON.stringify(sessions, null, 2) + '\n');
      } else {
        const header = ['NAME', 'STATUS', 'PARENT', 'CWD', 'UPTIME'];
        const plainStatus = (s: string) => `\u25cf ${s}`;
        const displayRows = sessions.map((s) => [
          s.name || '', plainStatus(s.status || ''), s.parent || '-', s.cwd || '', s.uptime || '',
        ]);
        const coloredRows = sessions.map((s) => [
          s.name || '',
          coloredStatus(s.status || ''),
          s.parent || '-',
          s.cwd || '',
          s.uptime || '',
        ]);
        printTable(header, coloredRows, displayRows);
      }
      break;
    }

    case 'log': {
      if (!args[0]) {
        process.stderr.write('Usage: nap log <name>\n');
        process.exit(1);
      }
      const sock = resolveSocketOrDie();
      const res = await send(sock, { type: 'log', id: requestId++, name: args[0] });
      if (res['error']) {
        process.stderr.write(String(res['message']) + '\n');
        process.exit(1);
      }
      const lines = res['lines'] as string[];
      for (const line of lines) {
        process.stdout.write(line + '\n');
      }
      break;
    }

    case 'peek': {
      if (!args[0]) {
        process.stderr.write('Usage: nap peek <name>\n');
        process.exit(1);
      }
      const sock = resolveSocketOrDie();
      const res = await send(sock, { type: 'peek', id: requestId++, name: args[0] });
      if (res['error']) {
        process.stderr.write(String(res['message']) + '\n');
        process.exit(1);
      }
      break;
    }

    case 'kill': {
      if (!args[0]) {
        process.stderr.write('Usage: nap kill <name>\n');
        process.exit(1);
      }
      const sock = resolveSocketOrDie();
      const res = await send(sock, { type: 'kill', id: requestId++, name: args[0] });
      if (res['error']) {
        process.stderr.write(String(res['message']) + '\n');
        process.exit(1);
      }
      break;
    }

    case 'close': {
      if (!args[0]) {
        process.stderr.write('Usage: nap close <name>\n');
        process.exit(1);
      }
      const sock = resolveSocketOrDie();
      const res = await send(sock, { type: 'close', id: requestId++, name: args[0] });
      if (res['error']) {
        process.stderr.write(String(res['message']) + '\n');
        process.exit(1);
      }
      break;
    }

    case 'poke': {
      if (!args[0] || !args[1]) {
        process.stderr.write('Usage: nap poke <name> <message>\n');
        process.exit(1);
      }
      const sock = resolveSocketOrDie();
      const res = await send(sock, {
        type: 'poke',
        id: requestId++,
        name: args[0],
        message: args[1],
      });
      if (res['error']) {
        process.stderr.write(String(res['message']) + '\n');
        process.exit(1);
      }
      break;
    }

    case 'nap': {
      if (!args[0]) {
        process.stderr.write('Usage: nap nap <name> [--timeout <seconds>]\n');
        process.exit(1);
      }
      const sock = resolveSocketOrDie();
      const name = args[0];
      const timeout = flags['timeout'] ? Number(flags['timeout']) : 600;
      const deadline = Date.now() + timeout * 1000;

      while (true) {
        const res = await send(sock, { type: 'status', id: requestId++, name });
        if (res['error']) {
          process.stderr.write(String(res['message']) + '\n');
          process.exit(1);
        }

        const status = res['status'] as string;
        if (status === 'done' || status === 'exited') {
          const doneMessage = (res['doneMessage'] as string) || '';
          if (doneMessage) {
            process.stdout.write(doneMessage + '\n');
          }
          process.exit(0);
        }

        if (Date.now() >= deadline) {
          process.stderr.write(`timeout waiting for ${name}\n`);
          process.exit(1);
        }

        await sleep(1000);
      }
      break;
    }

    case 'done': {
      const sessionId = process.env['NAP_SESSION_ID'];
      if (!sessionId) {
        process.stderr.write('not running inside nap\n');
        process.exit(1);
      }
      const sock = resolveSocketOrDie();
      const message = args[0] || '';
      const res = await send(sock, {
        type: 'done',
        id: requestId++,
        sessionId,
        message,
      });
      if (res['error']) {
        process.stderr.write(String(res['message']) + '\n');
        process.exit(1);
      }
      break;
    }

    case 'status': {
      if (!args[0] || !args[1]) {
        process.stderr.write('Usage: nap status <napkin-slug> <status>\n');
        process.exit(1);
      }
      const sock = resolveSocketOrDie();
      const res = await send(sock, {
        type: 'napkin-status',
        id: requestId++,
        napkinSlug: args[0],
        status: args[1],
      });
      if (res['error']) {
        process.stderr.write(String(res['message']) + '\n');
        process.exit(1);
      }
      process.stdout.write(`${args[0]} → ${args[1]}\n`);
      break;
    }

    default:
      process.stderr.write(`Unknown command: ${command}\n`);
      process.stdout.write(HELP_TEXT);
      process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write((err.message || String(err)) + '\n');
  process.exit(1);
});
