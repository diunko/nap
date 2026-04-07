#!/usr/bin/env node

import * as net from 'net';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { spawn } from 'child_process';
import * as crypto from 'crypto';
import { NdjsonParser, serialize } from '../shared/ndjson';
import { findSocketPath, findProjectRoot, isSocketAlive } from '../shared/constants';
import { parseKey, parseSeq } from '../main/key-parser';

// --- Help text ---

const HELP_TEXT = `nap3 — Napkin Agent Protocol

Usage: nap3 <command> [options]

Commands:
  init                          Bootstrap a project for agent collaboration
  setup [flags]                 Add capabilities to an existing project
  open                          Launch Nap.app (walks up to find .nap/)
  dev                           Launch in dev mode (HMR) for current project
  create napkin|agent|arch|nepic  Create an entity
  start <name> [prompt]         Start a pre-created agent
  ps [--json]                   List all agents (tree view)
  set-status <slug> <phase>     Set napkin phase
  status [--napkin|--agent|--nepic] Inspect any entity
  done                          Mark current session as done
  nap <name> [--timeout <s>]    Wait for agent to complete
  poke <name> <message>         Send input to agent terminal
  key <name> <key> [--seq]     Send raw keypress to agent pty
  peek <name>                   Focus agent terminal in UI
  log <name>                    Dump terminal scrollback
  stop <name>                   Stop an agent
  import-agents <nepic-dir>     Import existing agent dirs as archived
  hook permission-request       CC PermissionRequest hook handler
  permission-response           Resolve a pending permission request

Flags:
  --help                        Show help
`;

const COMMAND_HELP: Record<string, string> = {
  setup: `Usage: nap3 setup [--guardian] [--skills [--user]] [--import]

Add capabilities to an existing project. Requires .nap/ to exist.

  --guardian         Add guardian agent + permission hook config
  --skills           Copy napkin skills to .claude/skills/
  --user             With --skills: install to ~/.claude/skills/ instead
  --import           Scan project, create markers for unmarked entities
  --help             Show this help
`,
  init: `Usage: nap3 init [--name <name>] [--template <name>] [--add-skills [--user]]

Bootstrap a project for agent collaboration.

  --name <name>       Project name (default: cwd basename)
  --template <name>   Use a project template (copies seed mega-napkin)
  --template random   Pick a random template
  --list-templates    List available project templates
  --add-skills        Copy napkin skills to .claude/skills/
  --user              With --add-skills: install to ~/.claude/skills/ instead
  --help              Show this help
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
  key: `Usage: nap3 key <name> <key> [--seq <escape-sequence>]

Send a raw keypress or escape sequence to an agent's pty.

Named keys: enter, esc, tab, space, backspace,
            up, down, left, right,
            ctrl-c, ctrl-d, ctrl-z

  name              Agent name
  key               Named key or raw text
  --seq <value>     Send C-style escape sequence (e.g. "\\x1b[A")
  --help            Show this help

Examples:
  nap3 key 002-fs-eng enter
  nap3 key 002-fs-eng "1"
  nap3 key 002-fs-eng --seq "\\x1b[A"
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
  'import-agents': `Usage: nap3 import-agents <nepic-dir>

Import existing agent dirs (with prompt.md/response.md but no markers) as archived.

  nepic-dir         Path to nepic directory (e.g. .nap/nepics/01-v1)
  --help            Show this help
`,
  hook: `Usage: nap3 hook <event>

Handle a CC hook event. Currently supported:
  permission-request   Handle PermissionRequest hook (reads stdin JSON)

Reads NAP_SESSION_ID and NAP_SOCKET from environment.
  --help            Show this help
`,
  'permission-response': `Usage: nap3 permission-response --agent <id> --decision allow|deny

Resolve a pending permission request for an agent.

  --agent <id>      Agent session ID
  --decision        "allow" or "deny"
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

/**
 * Send request and wait for a non-ping response (for long-lived connections).
 * Ignores keepalive pings from the server.
 */
function sendLongLived(
  socketPath: string,
  request: Record<string, unknown>,
  timeoutMs: number,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const conn = net.createConnection(socketPath);
    const timer = setTimeout(() => {
      conn.destroy();
      resolve({});  // pass-through on timeout
    }, timeoutMs);

    conn.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (err.code === 'ENOENT' || err.code === 'ECONNREFUSED') {
        process.stderr.write('nap3 is not running (run nap3 open)\n');
        process.exit(1);
      }
      reject(err);
    });

    const parser = new NdjsonParser((msg) => {
      const obj = msg as Record<string, unknown>;
      // Ignore keepalive pings
      if (obj.type === 'ping') return;
      clearTimeout(timer);
      resolve(obj);
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
  pending: '\x1b[35m',
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

// --- Setup functions (shared between init and setup commands) ---

/** Read active nepic from ui-state.json, return its directory path. */
function getActiveNepicDir(cwd: string): string {
  const napDir = path.join(cwd, '.nap');
  const uiStatePath = path.join(napDir, 'ui-state.json');
  let activeNepicId = '01-v1';
  if (fs.existsSync(uiStatePath)) {
    try {
      const uiState = JSON.parse(fs.readFileSync(uiStatePath, 'utf-8'));
      if (uiState.activeNepicId) activeNepicId = uiState.activeNepicId;
    } catch {
      // Use default
    }
  }
  return path.join(napDir, 'nepics', activeNepicId);
}

/** Infer role from dir name: strip numeric prefix + first dash. */
function inferRole(dirName: string): string {
  return dirName.replace(/^\d+-/, '');
}

/** Create guardian agent + PermissionRequest hook config. Idempotent. */
function setupGuardian(cwd: string, nepicDir: string, templatesDir: string): void {
  const guardianDir = path.join(nepicDir, '20-architects', '002-guardian');
  const markerPath = path.join(guardianDir, '.agent.nap.json');

  if (!fs.existsSync(markerPath)) {
    fs.mkdirSync(guardianDir, { recursive: true });

    const guardianMarker = {
      cc_session_uuid: crypto.randomUUID(),
      role: 'guardian',
      name: '002-guardian',
      nepic: path.basename(nepicDir),
      created_at: Date.now(),
      started: false,
    };
    fs.writeFileSync(markerPath, JSON.stringify(guardianMarker, null, 2));

    const guardianPromptSrc = path.join(
      templatesDir, 'nepic', '20-architects', '002-guardian', 'prompt.md',
    );
    if (fs.existsSync(guardianPromptSrc)) {
      fs.copyFileSync(guardianPromptSrc, path.join(guardianDir, 'prompt.md'));
    }
  }

  // Ensure .claude/settings.json has PermissionRequest hook
  const claudeDir = path.join(cwd, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });
  const settingsPath = path.join(claudeDir, 'settings.json');
  let settings: Record<string, unknown> = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    } catch {
      // Start fresh
    }
  }
  settings.hooks = {
    ...(settings.hooks as Record<string, unknown> || {}),
    PermissionRequest: [{
      matcher: '',
      hooks: [{
        type: 'command',
        command: 'nap3 hook permission-request',
      }],
    }],
  };
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

/** Copy napkin skills to project or user dir. Overwrites existing. */
function setupSkills(cwd: string, templatesDir: string, user: boolean): void {
  const skillsSrc = path.join(templatesDir, 'skills');
  const skillsDest = user
    ? path.join(os.homedir(), '.claude', 'skills')
    : path.join(cwd, '.claude', 'skills');

  for (const skillName of ['napkin', 'napkin-format']) {
    const src = path.join(skillsSrc, skillName);
    if (!fs.existsSync(src)) continue;
    const dest = path.join(skillsDest, skillName);
    if (fs.existsSync(dest)) {
      fs.rmSync(dest, { recursive: true, force: true });
    }
    copyDirRecursive(src, dest);
  }
}

/** Scan project for unmarked napkins/agents/architects, create markers. Additive only. */
function setupImport(cwd: string): void {
  const nepicsDir = path.join(cwd, '.nap', 'nepics');
  if (!fs.existsSync(nepicsDir)) return;

  const nepicDirs = fs.readdirSync(nepicsDir, { withFileTypes: true })
    .filter(d => d.isDirectory());

  for (const nepicEntry of nepicDirs) {
    const nepicSlug = nepicEntry.name;
    const nepicPath = path.join(nepicsDir, nepicSlug);

    // Scan 30-napkins/*/
    const napkinsDir = path.join(nepicPath, '30-napkins');
    if (fs.existsSync(napkinsDir)) {
      const napkinDirs = fs.readdirSync(napkinsDir, { withFileTypes: true })
        .filter(d => d.isDirectory());

      for (const napkinEntry of napkinDirs) {
        const napkinSlug = napkinEntry.name;
        const napkinPath = path.join(napkinsDir, napkinSlug);
        const napkinMarkerPath = path.join(napkinPath, '.napkin.nap.json');

        // Create napkin marker if missing
        if (!fs.existsSync(napkinMarkerPath)) {
          const marker = { status: 'backlog', nepic: nepicSlug };
          fs.writeFileSync(napkinMarkerPath, JSON.stringify(marker, null, 2));
        }

        // Scan agents/*/
        const agentsDir = path.join(napkinPath, 'agents');
        if (fs.existsSync(agentsDir)) {
          const agentDirs = fs.readdirSync(agentsDir, { withFileTypes: true })
            .filter(d => d.isDirectory());

          for (const agentDir of agentDirs) {
            const agentPath = path.join(agentsDir, agentDir.name);
            const agentMarkerPath = path.join(agentPath, '.agent.nap.json');

            if (fs.existsSync(agentMarkerPath)) continue;

            // Skip empty dirs
            const files = fs.readdirSync(agentPath);
            if (files.length === 0) continue;

            const hasResponse = fs.existsSync(path.join(agentPath, 'response.md'));

            const marker = {
              cc_session_uuid: crypto.randomUUID(),
              role: inferRole(agentDir.name),
              name: agentDir.name,
              napkin: napkinSlug,
              nepic: nepicSlug,
              started: false,
              done: hasResponse,
              exited: false,
              archived: false,
              created_at: Date.now(),
            };
            fs.writeFileSync(agentMarkerPath, JSON.stringify(marker, null, 2));
          }
        }
      }
    }

    // Scan 20-architects/*/
    const architectsDir = path.join(nepicPath, '20-architects');
    if (fs.existsSync(architectsDir)) {
      const archDirs = fs.readdirSync(architectsDir, { withFileTypes: true })
        .filter(d => d.isDirectory());

      for (const archDir of archDirs) {
        const archPath = path.join(architectsDir, archDir.name);
        const archMarkerPath = path.join(archPath, '.agent.nap.json');

        if (fs.existsSync(archMarkerPath)) continue;

        // Skip empty dirs
        const files = fs.readdirSync(archPath);
        if (files.length === 0) continue;

        const hasResponse = fs.existsSync(path.join(archPath, 'response.md'));

        const marker = {
          cc_session_uuid: crypto.randomUUID(),
          role: inferRole(archDir.name),
          name: archDir.name,
          nepic: nepicSlug,
          started: false,
          done: hasResponse,
          exited: false,
          archived: false,
          created_at: Date.now(),
        };
        fs.writeFileSync(archMarkerPath, JSON.stringify(marker, null, 2));
      }
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
      const templatesDir = findTemplatesDir();

      // Handle --list-templates before anything else
      if (flags['list-templates']) {
        const projectsDir = path.join(templatesDir, 'projects');
        if (!fs.existsSync(projectsDir)) {
          process.stderr.write('No project templates found.\n');
          process.exit(1);
        }
        const templates = fs.readdirSync(projectsDir, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .sort((a, b) => a.name.localeCompare(b.name));
        for (const t of templates) {
          const descPath = path.join(projectsDir, t.name, 'description.txt');
          const desc = fs.existsSync(descPath)
            ? fs.readFileSync(descPath, 'utf-8').trim()
            : '';
          process.stdout.write(`  ${t.name.padEnd(20)} ${desc}\n`);
        }
        process.exit(0);
      }

      const cwd = process.cwd();
      const napDir = path.join(cwd, '.nap');

      if (fs.existsSync(napDir)) {
        process.stderr.write('Project already initialized. Run `nap3 open` to launch.\n');
        process.exit(1);
      }

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

      // Copy architect prompt.md — use template-specific version when --template is set
      const promptFileName = flags['template'] ? 'prompt-template.md' : 'prompt.md';
      const promptTemplatePath = path.join(
        templatesDir,
        'nepic',
        '20-architects',
        '001-architect',
        promptFileName,
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
        setupSkills(cwd, templatesDir, !!flags['user']);
      }

      // Handle --template: copy seed mega-napkin into the project
      if (flags['template'] && typeof flags['template'] === 'string') {
        const projectsDir = path.join(templatesDir, 'projects');
        let templateName = flags['template'] as string;

        if (templateName === 'random') {
          const available = fs.readdirSync(projectsDir, { withFileTypes: true })
            .filter((d) => d.isDirectory())
            .map((d) => d.name);
          if (available.length === 0) {
            process.stderr.write('No project templates found.\n');
            process.exit(1);
          }
          templateName = available[Math.floor(Math.random() * available.length)];
          process.stdout.write(`Picked template: ${templateName}\n`);
        }

        const templateDir = path.join(projectsDir, templateName);
        if (!fs.existsSync(templateDir)) {
          process.stderr.write(`Unknown template: ${templateName}\nRun nap3 init --list-templates to see available templates.\n`);
          // Clean up the .nap/ we just created
          fs.rmSync(napDir, { recursive: true, force: true });
          process.exit(1);
        }

        const seedPath = path.join(templateDir, 'seed.nap.md');
        if (fs.existsSync(seedPath)) {
          const destPath = path.join(napDir, 'nepics', '01-v1', '10-docs', '01-inputs.nap.md');
          fs.copyFileSync(seedPath, destPath);
        }
      }

      // Handle --guardian: create guardian agent + PermissionRequest hook config
      if (flags['guardian']) {
        setupGuardian(cwd, nepicDir, templatesDir);
      }

      process.stdout.write('Initialized NAP project in .nap/\n');
      break;
    }

    case 'setup': {
      const cwd = process.cwd();
      const napDir = path.join(cwd, '.nap');

      if (!fs.existsSync(napDir)) {
        process.stderr.write('Not a nap project (run nap3 init first)\n');
        process.exit(1);
      }

      const hasFlags = flags['guardian'] || flags['skills'] || flags['import'];
      if (!hasFlags) {
        process.stderr.write(COMMAND_HELP['setup']);
        process.exit(1);
      }

      const templatesDir = findTemplatesDir();

      if (flags['guardian']) {
        const nepicDir = getActiveNepicDir(cwd);
        setupGuardian(cwd, nepicDir, templatesDir);
      }

      if (flags['skills']) {
        setupSkills(cwd, templatesDir, !!flags['user']);
      }

      if (flags['import']) {
        setupImport(cwd);
      }

      process.stdout.write('Setup complete.\n');
      break;
    }

    case 'dev': {
      // Walk up from cwd to find .nap/
      const devProjectRoot = findProjectRoot(process.cwd());
      if (!devProjectRoot) {
        process.stderr.write('not a nap project (run nap3 init)\n');
        process.exit(1);
      }

      // Derive monorepo root from CLI binary location
      // Built CLI: packages/v3/out/cli/cli/nap.js → monorepo is 5 levels up
      const devPackageRoot = path.resolve(__dirname, '..', '..', '..');
      const devMonorepoRoot = path.resolve(devPackageRoot, '..', '..');

      // Verify it looks like the monorepo
      const devScript = path.join(devMonorepoRoot, 'package.json');
      if (!fs.existsSync(devScript)) {
        process.stderr.write('cannot find nap monorepo (is nap3 npm-linked?)\n');
        process.exit(1);
      }

      process.stdout.write(`dev mode: ${devProjectRoot}\n`);

      const child = spawn('npm', ['run', 'dev:v3'], {
        cwd: devMonorepoRoot,
        stdio: 'inherit',
        env: { ...process.env, NAP_CWD: devProjectRoot },
      });

      child.on('exit', (code) => process.exit(code ?? 0));
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
        process.stderr.write('Usage: nap3 poke <name> <message> [--esc]\n');
        process.exit(1);
      }
      const sock = resolveSocketOrDie();
      const res = await send(sock, {
        type: 'poke',
        id: requestId++,
        name: args[0],
        message: args.slice(1).join(' '),
        esc: flags['esc'] === true,
      });
      if (res['error']) {
        process.stderr.write(String(res['message']) + '\n');
        process.exit(1);
      }
      break;
    }

    case 'key': {
      const seqValue = flags['seq'];
      if (!args[0] || (!args[1] && !seqValue)) {
        process.stderr.write('Usage: nap3 key <name> <key> [--seq <escape-sequence>]\n');
        process.exit(1);
      }
      const keyName = args[0];
      let keyData: string;
      if (seqValue && typeof seqValue === 'string') {
        keyData = parseSeq(seqValue);
      } else {
        keyData = parseKey(args[1]);
      }
      const keySock = resolveSocketOrDie();
      const keyRes = await send(keySock, {
        type: 'key',
        id: requestId++,
        name: keyName,
        data: keyData,
      });
      if (keyRes['error']) {
        process.stderr.write(String(keyRes['message']) + '\n');
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

    case 'import-agents': {
      if (!args[0]) {
        process.stderr.write('Usage: nap3 import-agents <nepic-dir>\n');
        process.exit(1);
      }

      const nepicDir = path.resolve(args[0]);
      if (!fs.existsSync(nepicDir)) {
        process.stderr.write(`not found: ${nepicDir}\n`);
        process.exit(1);
      }

      let imported = 0;

      // Scan 30-napkins/*/agents/*/
      const napkinsDir = path.join(nepicDir, '30-napkins');
      if (fs.existsSync(napkinsDir)) {
        const napkinSlugs = fs.readdirSync(napkinsDir, { withFileTypes: true })
          .filter(d => d.isDirectory())
          .map(d => d.name);

        for (const napkinSlug of napkinSlugs) {
          const agentsDir = path.join(napkinsDir, napkinSlug, 'agents');
          if (!fs.existsSync(agentsDir)) continue;

          const agentDirs = fs.readdirSync(agentsDir, { withFileTypes: true })
            .filter(d => d.isDirectory());

          for (const agentDir of agentDirs) {
            const agentPath = path.join(agentsDir, agentDir.name);
            const markerPath = path.join(agentPath, '.agent.nap.json');

            // Skip if marker already exists
            if (fs.existsSync(markerPath)) continue;

            // Check if it looks like an agent dir (has prompt.md or response.md)
            const hasPrompt = fs.existsSync(path.join(agentPath, 'prompt.md'));
            const hasResponse = fs.existsSync(path.join(agentPath, 'response.md'));
            if (!hasPrompt && !hasResponse) continue;

            // Create marker
            const marker = {
              cc_session_uuid: crypto.randomUUID(),
              role: inferRole(agentDir.name),
              name: agentDir.name,
              napkin: napkinSlug,
              nepic: path.basename(nepicDir),
              archived: true,
              started: false,
              created_at: Date.now(),
            };

            fs.writeFileSync(markerPath, JSON.stringify(marker, null, 2));
            imported++;
            process.stdout.write(`  ${napkinSlug}/agents/${agentDir.name} → ${marker.role} (archived)\n`);
          }
        }
      }

      // Scan 20-architects/*/
      const architectsDir = path.join(nepicDir, '20-architects');
      if (fs.existsSync(architectsDir)) {
        const archDirs = fs.readdirSync(architectsDir, { withFileTypes: true })
          .filter(d => d.isDirectory());

        for (const archDir of archDirs) {
          const archPath = path.join(architectsDir, archDir.name);
          const markerPath = path.join(archPath, '.agent.nap.json');

          // Skip if marker already exists
          if (fs.existsSync(markerPath)) continue;

          // Check if it looks like an agent dir
          const hasPrompt = fs.existsSync(path.join(archPath, 'prompt.md'));
          const hasResponse = fs.existsSync(path.join(archPath, 'response.md'));
          if (!hasPrompt && !hasResponse) continue;

          // Create marker
          const marker = {
            cc_session_uuid: crypto.randomUUID(),
            role: 'architect',
            name: archDir.name,
            nepic: path.basename(nepicDir),
            archived: true,
            started: false,
            created_at: Date.now(),
          };

          fs.writeFileSync(markerPath, JSON.stringify(marker, null, 2));
          imported++;
          process.stdout.write(`  20-architects/${archDir.name} → architect (archived)\n`);
        }
      }

      process.stdout.write(`Imported ${imported} agent(s) as archived.\n`);
      break;
    }

    case 'hook': {
      const subcommand = args[0];
      if (subcommand !== 'permission-request') {
        process.stderr.write(`Unknown hook event: ${subcommand ?? '(none)'}\n`);
        process.stderr.write(COMMAND_HELP['hook']);
        process.exit(1);
      }

      // Read NAP_SESSION_ID from env
      const sessionId = process.env['NAP_SESSION_ID'];
      if (!sessionId) {
        process.stderr.write('NAP_SESSION_ID not set\n');
        process.exit(1);
      }

      // Resolve socket
      const hookSocket = process.env['NAP_SOCKET'];
      if (!hookSocket) {
        const found = findSocketPath(process.cwd());
        if (!found) {
          process.stderr.write('nap3 is not running\n');
          process.exit(1);
        }
      }
      const sock = hookSocket || findSocketPath(process.cwd())!;

      // Read hook payload from stdin
      let stdinData = '';
      for await (const chunk of process.stdin) {
        stdinData += chunk;
      }

      let payload: Record<string, unknown> = {};
      try {
        payload = JSON.parse(stdinData);
      } catch {
        // If stdin isn't valid JSON, continue with empty payload
      }

      const tool = (payload.tool_name as string) || '';
      const toolInput = (payload.tool_input as Record<string, unknown>) || {};
      const command = (toolInput.command as string) || '';

      // Send to socket and block until resolved (10 min timeout)
      const TIMEOUT_MS = 10 * 60 * 1000;
      const res = await sendLongLived(sock, {
        type: 'hook-permission-request',
        id: requestId++,
        agentId: sessionId,
        tool,
        command,
        payload,
      }, TIMEOUT_MS);

      // Format CC-compatible output
      const decision = res.decision as string | undefined;
      if (decision === 'allow') {
        process.stdout.write(JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'PermissionRequest',
            decision: { behavior: 'allow' },
          },
        }));
      } else if (decision === 'deny') {
        process.stdout.write(JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'PermissionRequest',
            decision: { behavior: 'deny', message: 'denied by guardian' },
          },
        }));
      }
      // No decision = pass-through (exit 0, CC shows its own dialog)
      break;
    }

    case 'permission-response': {
      // --list: show all pending permission requests
      if (flags['list']) {
        const sock = resolveSocketOrDie();
        const res = await send(sock, { type: 'permission-list', id: requestId++ });
        if (res['error']) {
          process.stderr.write(String(res['message']) + '\n');
          process.exit(1);
        }
        const pending = (res['pending'] as Array<{ agentId: string; name: string; tool: string; command: string }>) || [];
        if (pending.length === 0) {
          process.stdout.write('no pending permission requests\n');
        } else {
          for (const p of pending) {
            process.stdout.write(`${p.name} (${p.agentId}): ${p.tool} — ${p.command}\n`);
          }
        }
        break;
      }

      const agentId = flags['agent'] as string;
      const decision = flags['decision'] as string;

      if (!agentId) {
        process.stderr.write('--agent is required\n');
        process.exit(1);
      }
      if (decision !== 'allow' && decision !== 'deny') {
        process.stderr.write('invalid decision — use "allow" or "deny"\n');
        process.exit(1);
      }

      const sock = resolveSocketOrDie();
      const res = await send(sock, {
        type: 'permission-response',
        id: requestId++,
        agentId,
        decision,
      });
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
