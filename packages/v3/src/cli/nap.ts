#!/usr/bin/env node

import * as net from 'net';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { spawn } from 'child_process';
import * as crypto from 'crypto';
import { NdjsonParser, serialize } from '../shared/ndjson';
import { findSocketPath, findProjectRoot, isSocketAlive } from '../shared/constants';

// --- Help text ---

const HELP_TEXT = `nap3 — Napkin Agent Protocol

Usage: nap3 <command> [options]

Commands:
  init                          Bootstrap a project for agent collaboration
  open                          Launch Nap.app (walks up to find .nap/)
  create napkin|agent|arch|nepic  Create an entity
  start <name> [prompt]         Start a pre-created agent
  ps [--json]                   List all agents (tree view)
  set-status <slug> <phase>     Set napkin phase
  status [--napkin|--agent|--nepic] Inspect any entity
  done                          Mark current session as done
  nap <name> [--timeout <s>]    Wait for agent to complete
  poke <name> <message>         Send input to agent terminal
  peek <name>                   Focus agent terminal in UI
  log <name>                    Dump terminal scrollback
  stop <name>                   Stop an agent

Flags:
  --help                        Show help
`;

const COMMAND_HELP: Record<string, string> = {
  init: `Usage: nap3 init [--name <name>] [--add-skills [--user]]

Bootstrap a project for agent collaboration.

  --name <name>     Project name (default: cwd basename)
  --add-skills      Copy napkin skills to .claude/skills/
  --user            With --add-skills: install to ~/.claude/skills/ instead
  --help            Show this help
`,
  open: `Usage: nap3 open

Launch Nap.app. Walks up from cwd to find .nap/, like git.

  --help            Show this help
`,
  create: `Usage: nap3 create <type> <name> [options]

  nap3 create napkin <slug> [--status backlog] [--nepic <slug>]
  nap3 create agent <name> --napkin <slug> --role <role> [--nepic <slug>]
  nap3 create architect <name> [--nepic <slug>]
  nap3 create nepic <slug> --name <display-name>

All create commands output JSON to stdout.
`,
  start: `Usage: nap3 start <name> [prompt] [--nepic <slug>]

Start a pre-created agent by name.

  name              Agent name (exact match)
  prompt            Optional first message to Claude
  --nepic <slug>    Disambiguate across nepics
  --help            Show this help
`,
  ps: `Usage: nap3 ps [--json]

List all agents in a tree view.

  --json            Output raw JSON
  --help            Show this help
`,
  'set-status': `Usage: nap3 set-status <napkin-slug> <phase>

Set napkin phase.

  phase             One of: backlog, todo, doing, review, done
  --help            Show this help
`,
  status: `Usage: nap3 status [--napkin <slug>] [--agent <name>] [--nepic <slug>] [--json]

Inspect any entity. No flags = project overview.

  --napkin <slug>   Show napkin details
  --agent <name>    Show agent details
  --nepic <slug>    Show nepic summary
  --json            Output JSON
  --help            Show this help
`,
  done: `Usage: nap3 done

Mark current session as done. Reads NAP_SESSION_ID from env.

  --help            Show this help
`,
  nap: `Usage: nap3 nap <name> [--timeout <seconds>]

Wait for a session to complete.

  name              Agent name
  --timeout <secs>  Max wait time (default: 600)
  --help            Show this help
`,
  poke: `Usage: nap3 poke <name> <message>

Send input to a running agent's terminal.

  name              Agent name
  message           Text to send
  --help            Show this help
`,
  peek: `Usage: nap3 peek <name>

Focus an agent's terminal in the UI.

  name              Agent name
  --help            Show this help
`,
  log: `Usage: nap3 log <name>

Dump terminal scrollback to stdout.

  name              Agent name
  --help            Show this help
`,
  stop: `Usage: nap3 stop <name>

Stop an agent's process.

  name              Agent name
  --help            Show this help
`,
};

// --- Arg parsing ---

function parseArgs(argv: string[]): {
  command: string;
  args: string[];
  flags: Record<string, string | boolean>;
} {
  if (argv.length === 0 || argv[0] === '--help') {
    return { command: 'help', args: [], flags: {} };
  }

  const command = argv[0];
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
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
        process.stderr.write('nap3 is not running (run nap3 open)\n');
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
  if (process.env['NAP_SOCKET']) return process.env['NAP_SOCKET'];

  const found = findSocketPath(process.cwd());
  if (!found) {
    process.stderr.write('nap3 is not running (run nap3 open)\n');
    process.exit(1);
  }
  return found;
}

// --- Formatting ---

const STATUS_COLORS: Record<string, string> = {
  running: '\x1b[32m',
  exited: '\x1b[90m',
  done: '\x1b[34m',
  created: '\x1b[33m',
  started: '\x1b[33m',
};
const RESET = '\x1b[0m';

function coloredStatus(status: string): string {
  const color = STATUS_COLORS[status] || '';
  return `${color}\u25cf${RESET} ${status}`;
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

// ── Claude command construction ──

export function shellEscape(s: string): string {
  return s.replace(/'/g, "'\\''");
}

export function buildClaudeCommand(prompt: string): string {
  if (!prompt) return 'claude --verbose';
  return `claude --verbose '${shellEscape(prompt)}'`;
}

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
        process.stderr.write('Project already initialized. Run `nap3 open` to launch.\n');
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

      // Create empty dirs
      fs.mkdirSync(path.join(nepicDir, '10-docs'), { recursive: true });
      fs.mkdirSync(path.join(nepicDir, '30-napkins'), { recursive: true });

      // Create architect stub
      const architectDir = path.join(nepicDir, '20-architects', '001-architect');
      fs.mkdirSync(architectDir, { recursive: true });

      const ccSessionUuid = crypto.randomUUID();
      const now = Date.now();

      const architectMarker = {
        cc_session_uuid: ccSessionUuid,
        role: 'architect',
        name: '001-architect',
        nepic: '01-v1',
        created_at: now,
        started: false,
      };

      fs.writeFileSync(
        path.join(architectDir, '.agent.nap.json'),
        JSON.stringify(architectMarker, null, 2),
      );

      // Copy architect prompt.md from template
      const promptTemplatePath = path.join(
        templatesDir,
        'nepic',
        '20-architects',
        '001-architect',
        'prompt.md',
      );
      if (fs.existsSync(promptTemplatePath)) {
        fs.copyFileSync(
          promptTemplatePath,
          path.join(architectDir, 'prompt.md'),
        );
      }

      // Create .gitignore
      fs.writeFileSync(
        path.join(napDir, '.gitignore'),
        'sock\nui-state.json\n',
      );

      // Create ui-state.json
      fs.writeFileSync(
        path.join(napDir, 'ui-state.json'),
        JSON.stringify({ activeNepicId: '01-v1' }, null, 2),
      );

      // Handle --add-skills
      if (flags['add-skills']) {
        const skillsSrc = path.join(templatesDir, 'skills');
        let skillsDest: string;
        if (flags['user']) {
          skillsDest = path.join(os.homedir(), '.claude', 'skills');
        } else {
          skillsDest = path.join(cwd, '.claude', 'skills');
        }

        if (fs.existsSync(path.join(skillsSrc, 'napkin'))) {
          copyDirRecursive(
            path.join(skillsSrc, 'napkin'),
            path.join(skillsDest, 'napkin'),
          );
        }
        if (fs.existsSync(path.join(skillsSrc, 'napkin-format'))) {
          copyDirRecursive(
            path.join(skillsSrc, 'napkin-format'),
            path.join(skillsDest, 'napkin-format'),
          );
        }
      }

      process.stdout.write('Initialized NAP project in .nap/\n');
      break;
    }

    case 'open': {
      // Walk up from cwd to find .nap/
      const projectRoot = findProjectRoot(process.cwd());
      if (!projectRoot) {
        process.stderr.write('not a nap project (run nap3 init)\n');
        process.exit(1);
      }

      // Check if already running
      const candidateSocket = path.join(projectRoot, '.nap', 'sock');
      if (fs.existsSync(candidateSocket)) {
        const alive = await isSocketAlive(candidateSocket);
        if (alive) {
          process.stderr.write('nap3 is already running in this project\n');
          process.exit(1);
        }
      }

      // Find electron binary
      const packageRoot = path.resolve(__dirname, '..', '..', '..');
      const mainScript = path.join(
        process.env['NAP_APP_PATH'] || packageRoot,
        'out', 'main', 'main.js',
      );

      function findElectronBin(startDir: string): string | null {
        let dir = startDir;
        while (true) {
          const candidate = path.join(dir, 'node_modules', '.bin', 'electron');
          if (fs.existsSync(candidate)) return candidate;
          const parent = path.dirname(dir);
          if (parent === dir) return null;
          dir = parent;
        }
      }

      const appRoot = process.env['NAP_APP_PATH'] || packageRoot;
      const electronBin = findElectronBin(appRoot);

      if (!electronBin) {
        process.stderr.write('electron not found\n');
        process.stderr.write('set NAP_APP_PATH to your nap-app directory\n');
        process.exit(1);
      }

      // Spawn detached — no flags
      const electronArgs = [mainScript, '--cwd', projectRoot];
      const child = spawn(electronBin, electronArgs, {
        detached: true,
        stdio: 'ignore',
        cwd: projectRoot,
      });
      child.unref();
      break;
    }

    case 'create': {
      if (!args[0]) {
        process.stderr.write(COMMAND_HELP['create']);
        process.exit(1);
      }

      const subcommand = args[0];
      const sock = resolveSocketOrDie();

      switch (subcommand) {
        case 'napkin': {
          if (!args[1]) {
            process.stderr.write('Usage: nap3 create napkin <slug> [--status backlog] [--nepic <slug>]\n');
            process.exit(1);
          }
          const res = await send(sock, {
            type: 'create-napkin',
            id: requestId++,
            slug: args[1],
            status: (flags['status'] as string) || 'backlog',
            nepicId: (flags['nepic'] as string) || undefined,
          });
          if (res['error']) {
            process.stderr.write(String(res['message']) + '\n');
            process.exit(1);
          }
          process.stdout.write(JSON.stringify(res, null, 2) + '\n');
          break;
        }

        case 'agent': {
          if (!args[1]) {
            process.stderr.write('Usage: nap3 create agent <name> --napkin <slug> --role <role> [--nepic <slug>]\n');
            process.exit(1);
          }
          if (!flags['napkin'] || !flags['role']) {
            process.stderr.write('--napkin and --role are required\n');
            process.exit(1);
          }
          const res = await send(sock, {
            type: 'create-agent',
            id: requestId++,
            napkinSlug: flags['napkin'] as string,
            name: args[1],
            role: flags['role'] as string,
            nepicId: (flags['nepic'] as string) || undefined,
          });
          if (res['error']) {
            process.stderr.write(String(res['message']) + '\n');
            process.exit(1);
          }
          process.stdout.write(JSON.stringify(res, null, 2) + '\n');
          break;
        }

        case 'architect': {
          if (!args[1]) {
            process.stderr.write('Usage: nap3 create architect <name> [--nepic <slug>]\n');
            process.exit(1);
          }
          const res = await send(sock, {
            type: 'create-architect',
            id: requestId++,
            name: args[1],
            nepicId: (flags['nepic'] as string) || undefined,
          });
          if (res['error']) {
            process.stderr.write(String(res['message']) + '\n');
            process.exit(1);
          }
          process.stdout.write(JSON.stringify(res, null, 2) + '\n');
          break;
        }

        case 'nepic': {
          if (!args[1]) {
            process.stderr.write('Usage: nap3 create nepic <slug> --name <display-name>\n');
            process.exit(1);
          }
          if (!flags['name']) {
            process.stderr.write('--name is required\n');
            process.exit(1);
          }
          const res = await send(sock, {
            type: 'create-nepic',
            id: requestId++,
            slug: args[1],
            displayName: flags['name'] as string,
          });
          if (res['error']) {
            process.stderr.write(String(res['message']) + '\n');
            process.exit(1);
          }
          process.stdout.write(JSON.stringify(res, null, 2) + '\n');
          break;
        }

        default:
          process.stderr.write(`Unknown create type: ${subcommand}\n`);
          process.stderr.write(COMMAND_HELP['create']);
          process.exit(1);
      }
      break;
    }

    case 'start': {
      if (!args[0]) {
        process.stderr.write('Usage: nap3 start <name> [prompt] [--nepic <slug>]\n');
        process.exit(1);
      }
      const name = args[0];
      const prompt = args.slice(1).join(' ') || undefined;
      const sock = resolveSocketOrDie();
      const res = await send(sock, {
        type: 'start',
        id: requestId++,
        name,
        prompt,
        nepicId: (flags['nepic'] as string) || undefined,
      });
      if (res['error']) {
        process.stderr.write(String(res['message']) + '\n');
        process.exit(1);
      }
      process.stdout.write(JSON.stringify({ id: res['id'], name: res['name'], pid: res['pid'] }) + '\n');
      break;
    }

    case 'ps': {
      const sock = resolveSocketOrDie();
      const res = await send(sock, { type: 'ps', id: requestId++ });
      if (res['error']) {
        process.stderr.write(String(res['message']) + '\n');
        process.exit(1);
      }

      interface TreeNode {
        name: string;
        status: string;
        napkin: string | null;
        role: string;
        children: TreeNode[];
      }

      const agents = res['agents'] as TreeNode[];

      if (flags['json']) {
        process.stdout.write(JSON.stringify(agents, null, 2) + '\n');
      } else {
        // Print tree with 4 columns: NAME, STATUS, NAPKIN, ROLE
        process.stdout.write('NAME                      STATUS     NAPKIN              ROLE\n');

        function renderTree(nodes: TreeNode[], indent: number): void {
          for (const node of nodes) {
            const prefix = '  '.repeat(indent);
            const label = (prefix + node.name).padEnd(26);
            const status = coloredStatus(node.status);
            const statusPlain = node.status;
            const napkin = (node.napkin || '').padEnd(20);
            const role = node.role;
            // Manual padding since coloredStatus has ANSI codes
            const statusPadded = status + ' '.repeat(Math.max(0, 11 - statusPlain.length - 2));
            process.stdout.write(`${label}${statusPadded}${napkin}${role}\n`);
            renderTree(node.children, indent + 1);
          }
        }

        renderTree(agents, 0);
      }
      break;
    }

    case 'set-status': {
      if (!args[0] || !args[1]) {
        process.stderr.write('Usage: nap3 set-status <napkin-slug> <phase>\n');
        process.exit(1);
      }
      const sock = resolveSocketOrDie();
      const res = await send(sock, {
        type: 'set-status',
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

    case 'status': {
      const sock = resolveSocketOrDie();
      const query: Record<string, string> = {};
      if (flags['napkin'] && typeof flags['napkin'] === 'string') query['napkin'] = flags['napkin'];
      if (flags['agent'] && typeof flags['agent'] === 'string') query['agent'] = flags['agent'];
      if (flags['nepic'] && typeof flags['nepic'] === 'string') query['nepic'] = flags['nepic'];

      const res = await send(sock, {
        type: 'status',
        id: requestId++,
        query,
      });
      if (res['error']) {
        process.stderr.write(String(res['message']) + '\n');
        process.exit(1);
      }

      if (flags['json']) {
        process.stdout.write(JSON.stringify(res, null, 2) + '\n');
      } else {
        // Human-readable output
        for (const [key, value] of Object.entries(res)) {
          if (key === 'id') continue;
          if (typeof value === 'object' && value !== null) {
            process.stdout.write(`${key}:\n`);
            for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
              process.stdout.write(`  ${k}: ${JSON.stringify(v)}\n`);
            }
          } else {
            process.stdout.write(`${key}: ${value}\n`);
          }
        }
      }
      break;
    }

    case 'done': {
      const sessionId = process.env['NAP_SESSION_ID'];
      if (!sessionId) {
        process.stderr.write('not running inside nap3\n');
        process.exit(1);
      }
      const sock = resolveSocketOrDie();
      const res = await send(sock, {
        type: 'done',
        id: requestId++,
        sessionId,
      });
      if (res['error']) {
        process.stderr.write(String(res['message']) + '\n');
        process.exit(1);
      }
      break;
    }

    case 'nap': {
      if (!args[0]) {
        process.stderr.write('Usage: nap3 nap <name> [--timeout <seconds>]\n');
        process.exit(1);
      }
      const sock = resolveSocketOrDie();
      const name = args[0];
      const timeout = flags['timeout'] ? Number(flags['timeout']) : 600;
      const deadline = Date.now() + timeout * 1000;

      while (true) {
        const res = await send(sock, { type: 'nap-wait', id: requestId++, name });
        if (res['error']) {
          process.stderr.write(String(res['message']) + '\n');
          process.exit(1);
        }

        const status = res['status'] as string;
        if (status === 'done' || status === 'exited') {
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

    case 'poke': {
      if (!args[0] || !args[1]) {
        process.stderr.write('Usage: nap3 poke <name> <message>\n');
        process.exit(1);
      }
      const sock = resolveSocketOrDie();
      const res = await send(sock, {
        type: 'poke',
        id: requestId++,
        name: args[0],
        message: args.slice(1).join(' '),
      });
      if (res['error']) {
        process.stderr.write(String(res['message']) + '\n');
        process.exit(1);
      }
      break;
    }

    case 'peek': {
      if (!args[0]) {
        process.stderr.write('Usage: nap3 peek <name>\n');
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

    case 'log': {
      if (!args[0]) {
        process.stderr.write('Usage: nap3 log <name>\n');
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

    case 'stop': {
      if (!args[0]) {
        process.stderr.write('Usage: nap3 stop <name>\n');
        process.exit(1);
      }
      const sock = resolveSocketOrDie();
      const res = await send(sock, { type: 'stop', id: requestId++, name: args[0] });
      if (res['error']) {
        process.stderr.write(String(res['message']) + '\n');
        process.exit(1);
      }
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
