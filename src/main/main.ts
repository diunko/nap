import { app, BrowserWindow, ipcMain, IpcMainEvent, Menu, dialog, shell, systemPreferences } from 'electron';

// In test mode, tell macOS to ignore saved application state —
// prevents the "unexpectedly quit" dialog from blocking test runs
if (process.env.NAP_TEST && process.platform === 'darwin') {
  systemPreferences.setUserDefault('ApplePersistenceIgnoreState', 'boolean', true);
}
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import type { IPty, IDisposable } from 'node-pty';
import * as pty from 'node-pty';
import { startSocketServer, stopSocketServer } from './socket-server';
import Database from 'better-sqlite3';
import { initDatabase, getDbPath, closeDatabase, SCHEMA } from './database';
import { injectSessionId } from './inject-session-id';

// DEBUG: capture raw PTY output to file for scroll analysis
const PTY_CAPTURE_PATH = path.join(app.getPath('home'), 'nap-pty-capture.log');
let ptyCaptureStream: fs.WriteStream | null = null;
function getPtyCaptureStream(): fs.WriteStream {
  if (!ptyCaptureStream) {
    ptyCaptureStream = fs.createWriteStream(PTY_CAPTURE_PATH, { flags: 'w' });
    console.log(`[debug] PTY capture → ${PTY_CAPTURE_PATH}`);
  }
  return ptyCaptureStream;
}
import { randomUUID } from 'crypto';
import {
  initSessionStore,
  closeSessionStore,
  createSession,
  getSession,
  getAllSessions,
  setSessionStatus,
  setSessionDone,
  removeSession,
  saveUiState,
  loadUiState,
  getArchitectForNepic,
  createNepicRow,
  getAllNepics,
  setNepicActive,
  getNepicById,
} from './session-store';
import type { UiState } from './session-store';
import { initNapkinStore, closeNapkinStore, changeNapkinStatus, getAllNapkinStatuses, getNapkinStatusesForNepic } from './napkin-store';
import { startNapkinWatcher, stopNapkinWatcher, readNapkinDir, getActiveNapkinData } from './napkin-watcher';
import { resolveByName } from './name-resolver';
import { reconcile } from './reconcile';
import { setWriter, enqueue, clearQueue } from './message-queue';
import { getServerSocketPath } from '../shared/constants';
import type { SocketRequest } from '../shared/protocol';

// Parse --cwd and --name from argv (passed by `nap open`)
function parseArgvFlag(flag: string): string | undefined {
  const args = process.argv;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag && args[i + 1]) return args[i + 1];
  }
  return undefined;
}

const projectCwd = parseArgvFlag('--cwd') || process.cwd();

const initialTerminalName = parseArgvFlag('--name') || 'shell';
const initialTerminalCommand = parseArgvFlag('--command');
const socketPath = getServerSocketPath(projectCwd);

let mainWindow: BrowserWindow | null = null;

interface PtyEntry {
  process: IPty;
  dataDisposable: IDisposable;
  exitDisposable: IDisposable;
}

const ptys = new Map<string, PtyEntry>();
const outputBuffers = new Map<string, string[]>();
const readyTerminals = new Set<string>();

// Track live ptys so we can wait for them all to exit before quitting
let pendingExits = 0;
let quitAfterExits = false;

// Architect resume state (for expired-session fallback)
let architectResumeId: string | null = null;
let architectResumeTime = 0;
let architectResumeCwd: string = projectCwd;

// Resumed architect session (used by get-resume-data IPC)
let resumedArchitectSession: import('./session-store').Session | null = null;

function checkQuit(): void {
  if (quitAfterExits && pendingExits === 0) {
    app.quit();
  }
}

function killAllPtys(): void {
  for (const entry of ptys.values()) {
    entry.dataDisposable.dispose();
    entry.process.kill();
  }
}

function killPty(id: string): void {
  const entry = ptys.get(id);
  if (entry) {
    entry.dataDisposable.dispose();
    entry.process.kill();
    outputBuffers.delete(id);
    readyTerminals.delete(id);
    clearQueue(id);
  }
}

function writeToPty(id: string, data: string): void {
  ptys.get(id)?.process.write(data);
}

function createPtyProcess(
  id: string,
  opts: { command?: string; cwd?: string },
): void {
  const userShell = process.env.SHELL || '/bin/zsh';
  const args = opts.command ? ['-c', opts.command] : ['--login'];
  const finalCwd = opts.cwd || projectCwd;

  const ptyProcess = pty.spawn(userShell, args, {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: finalCwd,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      NAP_SESSION_ID: id,
    } as Record<string, string>,
  });

  pendingExits++;

  const dataDisposable = ptyProcess.onData((data: string) => {
    // DEBUG: write raw PTY bytes to capture file
    getPtyCaptureStream().write(data);

    if (readyTerminals.has(id) && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('pty:data', id, data);
    } else {
      const buffer = outputBuffers.get(id);
      if (buffer) buffer.push(data);
    }
  });

  const exitDisposable = ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
    // Architect resume fallback: if resumed session exited quickly, spawn fresh
    if (architectResumeId === id && (Date.now() - architectResumeTime) < 5000) {
      architectResumeId = null;
      ptys.delete(id);
      outputBuffers.delete(id);
      // Keep readyTerminals — renderer is still listening
      pendingExits--;
      createPtyProcess(id, { command: 'claude', cwd: architectResumeCwd });
      return;
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('pty:exit', id, exitCode);
    }
    ptys.delete(id);
    outputBuffers.delete(id);
    readyTerminals.delete(id);
    try {
      const session = getSession(id);
      if (session && session.status !== 'done') {
        setSessionStatus(id, 'exited');
      }
    } catch {
      // DB already closed during shutdown — safe to ignore
    }
    pendingExits--;
    checkQuit();
  });

  ptys.set(id, { process: ptyProcess, dataDisposable, exitDisposable });
  outputBuffers.set(id, []);
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 600,
    minHeight: 400,
    backgroundColor: '#1e1e1e',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    if (!process.env['NAP_TEST'] || process.env['HEADED']) mainWindow!.show();
  });

  mainWindow.setTitle(path.basename(projectCwd));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function buildMenu(): void {
  const menu = Menu.buildFromTemplate([
    {
      label: app.name,
      submenu: [{ role: 'quit' }],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Sidebar',
          accelerator: 'CmdOrCtrl+B',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('sidebar:toggle');
            }
          },
        },
        {
          label: 'Toggle Kanban',
          accelerator: 'CmdOrCtrl+`',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('kanban:toggle');
            }
          },
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Terminal',
      submenu: [
        {
          label: 'New Terminal',
          accelerator: 'CmdOrCtrl+T',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('terminal:create');
            }
          },
        },
        {
          label: 'Close Terminal',
          accelerator: 'CmdOrCtrl+W',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('terminal:close-active');
            }
          },
        },
        { type: 'separator' },
        {
          label: 'Toggle Scroll Lock',
          accelerator: 'CmdOrCtrl+G',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('scroll-lock:toggle');
            }
          },
        },
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);
}

// IPC: create a new pty (renderer-initiated)
ipcMain.on(
  'pty:create',
  (
    _event: IpcMainEvent,
    id: string,
    opts?: { name?: string; parentId?: string; cwd?: string; command?: string },
  ) => {
    const name = opts?.name || 'shell';
    const cwd = opts?.cwd || projectCwd;
    const parentId = opts?.parentId || null;

    createSession({ id, name, cwd, parentId });
    createPtyProcess(id, { cwd, command: opts?.command });
  },
);

// IPC: kill a pty
ipcMain.on('pty:kill', (_event: IpcMainEvent, id: string) => {
  killPty(id);
});

// IPC: close a pty (kill + remove session)
ipcMain.on('pty:close', (_event: IpcMainEvent, id: string) => {
  killPty(id);
  removeSession(id);
});

// IPC: renderer signals terminal is ready to receive data
ipcMain.on('pty:ready', (_event: IpcMainEvent, id: string) => {
  readyTerminals.add(id);
  const buffer = outputBuffers.get(id) || [];
  for (const data of buffer) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('pty:data', id, data);
    }
  }
  outputBuffers.delete(id);
});

// IPC: renderer input → pty
ipcMain.on('pty:write', (_event: IpcMainEvent, id: string, data: string) => {
  ptys.get(id)?.process.write(data);
});

// IPC: renderer resize → pty
ipcMain.on('pty:resize', (_event: IpcMainEvent, id: string, cols: number, rows: number) => {
  ptys.get(id)?.process.resize(cols, rows);
});

// Pending log requests: requestId → resolve callback
const pendingLogRequests = new Map<number, (lines: string[]) => void>();
let logRequestCounter = 0;

// IPC: renderer sends log buffer back
ipcMain.on(
  'socket:log-response',
  (_event: IpcMainEvent, requestId: number, lines: string[]) => {
    const resolve = pendingLogRequests.get(requestId);
    if (resolve) {
      pendingLogRequests.delete(requestId);
      resolve(lines);
    }
  },
);

// IPC: renderer queries initial terminal options (set via --name/--command flags)
ipcMain.handle('get-initial-terminal-opts', () => ({
  name: initialTerminalName,
  command: initialTerminalCommand,
}));

// ── UI State tracking ──
// Renderer pushes state changes here; main saves on before-quit
let trackedUiState: UiState = { activeNepicId: null, activeTerminalId: null, sidebarVisible: true };

ipcMain.on('ui-state:update', (_event: IpcMainEvent, state: UiState) => {
  trackedUiState = state;
});

// Renderer requests saved UI state on launch
ipcMain.handle('get-ui-state', () => {
  try {
    return loadUiState();
  } catch {
    return null;
  }
});

// IPC: get initial napkin data (pull-based, for renderer startup)
ipcMain.handle('get-napkin-data', async () => {
  const napkins = await getActiveNapkinData();
  const statuses = getAllNapkinStatuses();
  return { napkins, statuses };
});

// IPC: get resume data (architect session + orphaned sessions)
ipcMain.handle('get-resume-data', () => {
  try {
    const livePtyIds = [...ptys.keys()];
    const allSessions = getAllSessions();
    const orphaned = allSessions
      .filter((s) =>
        s.status === 'running' &&
        !livePtyIds.includes(s.id) &&
        s.id !== resumedArchitectSession?.id,
      )
      .map((s) => ({
        id: s.id,
        name: s.name,
        role: s.role,
        napkinSlug: s.napkinSlug,
        ccSessionUuid: s.ccSessionUuid,
        parentId: s.parentId,
        cwd: s.cwd,
      }));

    return {
      architectSession: resumedArchitectSession
        ? {
            id: resumedArchitectSession.id,
            name: resumedArchitectSession.name,
            role: resumedArchitectSession.role,
            napkinSlug: resumedArchitectSession.napkinSlug,
            ccSessionUuid: resumedArchitectSession.ccSessionUuid,
            parentId: resumedArchitectSession.parentId,
            cwd: resumedArchitectSession.cwd,
          }
        : null,
      orphanedSessions: orphaned,
    };
  } catch {
    return { architectSession: null, orphanedSessions: [] };
  }
});

// ── Nepic creation ──

function handleNepicCreate(name: string): {
  nepic: { id: string; name: string; slug: string };
  architectSession: { id: string; name: string; role: string; cwd: string; ccSessionUuid: string };
} {
  // 1. Generate slug: NN-name where NN is next available number
  const nepicsBase = path.join(projectCwd, '.nap', 'nepics');
  fs.mkdirSync(nepicsBase, { recursive: true });

  let maxNum = 0;
  try {
    for (const d of fs.readdirSync(nepicsBase)) {
      const match = d.match(/^(\d+)-/);
      if (match) {
        maxNum = Math.max(maxNum, parseInt(match[1], 10));
      }
    }
  } catch {
    // empty or unreadable — start at 0
  }

  const nn = String(maxNum + 1).padStart(2, '0');
  const slug = `${nn}-${name}`;
  const nepicDir = path.join(nepicsBase, slug);

  // 2. Scaffold directories
  const dirs = [
    '10-docs',
    '15-feedback',
    '20-architects/001-architect',
    '30-napkins',
    '40-board/10-draft',
    '40-board/20-backlog',
    '40-board/30-todo',
    '40-board/40-doing',
    '40-board/50-review',
    '40-board/60-done',
  ];
  for (const d of dirs) {
    fs.mkdirSync(path.join(nepicDir, d), { recursive: true });
  }

  // 3. Write architect prompt.md template
  const promptContent = `You're the architect for nepic "${name}". Read your role and the project context:

1. \`.nap/00-org/10-promise.nap.md\`
2. \`.nap/00-org/40-roles/\`

Start by understanding what this nepic is about. Create napkins in \`30-napkins/\` for each feature.
`;
  fs.writeFileSync(
    path.join(nepicDir, '20-architects', '001-architect', 'prompt.md'),
    promptContent,
  );

  // 4. SQLite: deactivate all nepics, insert new one as active
  const nepicId = randomUUID();
  createNepicRow({ id: nepicId, name, slug });

  // 5. Create architect session
  const architectSession = createSession({
    name: '001-architect',
    cwd: nepicDir,
    role: 'architect',
    nepicId,
  });

  // 6. Spawn architect pty
  const baseCommand = 'claude --verbose "read prompt.md and follow its instructions"';
  const command = injectSessionId(baseCommand, architectSession.ccSessionUuid!);
  createPtyProcess(architectSession.id, { command, cwd: nepicDir });

  // 7. Update ui_state
  saveUiState({
    activeNepicId: nepicId,
    activeTerminalId: architectSession.id,
    sidebarVisible: true,
  });

  // 8. Restart napkin watcher for new nepic
  stopNapkinWatcher();
  if (mainWindow) {
    startNapkinWatcher(nepicDir, mainWindow);
  }

  return {
    nepic: { id: nepicId, name, slug },
    architectSession: {
      id: architectSession.id,
      name: architectSession.name,
      role: 'architect',
      cwd: nepicDir,
      ccSessionUuid: architectSession.ccSessionUuid!,
    },
  };
}

// IPC: create a new nepic
ipcMain.handle('nepic:create', (_event, name: string) => {
  return handleNepicCreate(name);
});

// IPC: switch active nepic
ipcMain.handle('nepic:switch', async (_event, nepicId: string) => {
  const nepic = getNepicById(nepicId);
  if (!nepic) return { architectSessionId: null, napkinStatuses: [] };

  setNepicActive(nepicId);

  const nepicDir = path.join(projectCwd, '.nap', 'nepics', nepic.slug);

  stopNapkinWatcher();
  if (mainWindow) {
    await startNapkinWatcher(nepicDir, mainWindow);
  }

  const napkinStatuses = getNapkinStatusesForNepic(nepicId);
  const architect = getArchitectForNepic(nepicId);

  return {
    architectSessionId: architect?.id ?? null,
    napkinStatuses,
  };
});

// IPC: get all nepics
ipcMain.handle('get-nepics', () => {
  return getAllNepics();
});

// IPC: resume an orphaned agent's pty
ipcMain.on('pty:resume', (_event: IpcMainEvent, id: string, ccSessionUuid: string) => {
  const session = getSession(id);
  const command = `claude --verbose --resume ${ccSessionUuid}`;
  createPtyProcess(id, { command, cwd: session?.cwd || projectCwd });
});

// IPC: renderer asks to open a file path
ipcMain.on('open-file-path', (_event: IpcMainEvent, filePath: string) => {
  shell.openPath(filePath);
});

function requestLogBuffer(terminalId: string): Promise<string[]> {
  return new Promise((resolve) => {
    const requestId = ++logRequestCounter;
    pendingLogRequests.set(requestId, resolve);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('socket:log-request', { id: terminalId, requestId });
    }
    // Timeout after 5s
    setTimeout(() => {
      if (pendingLogRequests.has(requestId)) {
        pendingLogRequests.delete(requestId);
        resolve([]);
      }
    }, 5000);
  });
}

// Socket request handler
async function handleSocketRequest(msg: unknown): Promise<Record<string, unknown>> {
  const req = msg as SocketRequest;

  switch (req.type) {
    case 'start': {
      const session = createSession({
        command: req.command,
        name: req.name,
        cwd: req.cwd || projectCwd,
        parentId: req.parentId ?? null,
      });
      const ptyCommand = session.ccSessionUuid
        ? injectSessionId(req.command, session.ccSessionUuid)
        : req.command;
      createPtyProcess(session.id, { command: ptyCommand, cwd: req.cwd });

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('socket:terminal-created', {
          id: session.id,
          name: session.name,
          parentId: session.parentId,
          cwd: session.cwd,
          role: session.role,
          napkinSlug: session.napkinSlug,
        });
      }

      return { id: req.id, ok: true, sessionId: session.id, name: session.name };
    }

    case 'ps': {
      const sessions = getAllSessions();
      const list = sessions.map((s) => ({
        id: s.id,
        name: s.name,
        status: s.status,
        ccSessionUuid: s.ccSessionUuid,
        parent: s.parentId ? getSession(s.parentId)?.name ?? '-' : '-',
        cwd: s.cwd,
        uptime: formatUptime(s.createdAt),
      }));
      return { id: req.id, ok: true, sessions: list };
    }

    case 'peek': {
      const sessions = getAllSessions();
      const result = resolveByName(sessions, req.name);
      if (!result.ok) return { id: req.id, error: 'not_found', message: result.error };

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('socket:peek', { id: result.session.id });
      }
      return { id: req.id, ok: true };
    }

    case 'kill': {
      const sessions = getAllSessions();
      const result = resolveByName(sessions, req.name);
      if (!result.ok) return { id: req.id, error: 'not_found', message: result.error };

      killPty(result.session.id);
      return { id: req.id, ok: true };
    }

    case 'close': {
      const sessions = getAllSessions();
      const result = resolveByName(sessions, req.name);
      if (!result.ok) return { id: req.id, error: 'not_found', message: result.error };

      killPty(result.session.id);
      removeSession(result.session.id);

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('socket:terminal-close', { id: result.session.id });
      }
      return { id: req.id, ok: true };
    }

    case 'poke': {
      const sessions = getAllSessions();
      const result = resolveByName(sessions, req.name);
      if (!result.ok) return { id: req.id, error: 'not_found', message: result.error };

      const target = result.session;
      if (target.status !== 'running') {
        return { id: req.id, error: 'not_running', message: `${req.name} is not running` };
      }

      enqueue(target.id, req.message);
      return { id: req.id, ok: true };
    }

    case 'status': {
      const sessions = getAllSessions();
      const result = resolveByName(sessions, req.name);
      if (!result.ok) return { id: req.id, error: 'not_found', message: result.error };

      const target = result.session;
      return {
        id: req.id,
        ok: true,
        status: target.status,
        doneMessage: target.doneMessage ?? '',
        ccSessionUuid: target.ccSessionUuid,
      };
    }

    case 'done': {
      const session = getSession(req.sessionId);
      if (!session) {
        return { id: req.id, error: 'not_found', message: 'session not found' };
      }

      // Idempotent: second done call is a no-op
      if (session.status === 'done') {
        return { id: req.id, ok: true };
      }

      setSessionDone(session.id, req.message);

      // Notify renderer of status change
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('socket:status-changed', {
          id: session.id,
          status: 'done',
        });
      }

      // Poke parent if exists
      if (session.parentId) {
        const parent = getSession(session.parentId);
        if (parent && parent.status === 'running') {
          enqueue(parent.id, req.message);
        }
      }

      return { id: req.id, ok: true };
    }

    case 'log': {
      const sessions = getAllSessions();
      const result = resolveByName(sessions, req.name);
      if (!result.ok) return { id: req.id, error: 'not_found', message: result.error };

      const lines = await requestLogBuffer(result.session.id);
      return { id: req.id, ok: true, lines };
    }

    case 'napkin-status': {
      try {
        changeNapkinStatus(req.napkinSlug, req.status);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('not found')) {
          return { id: req.id, error: 'not_found', message };
        }
        if (message.includes('Invalid status')) {
          return { id: req.id, error: 'invalid_status', message };
        }
        return { id: req.id, error: 'error', message };
      }

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('napkin:status-changed', {
          slug: req.napkinSlug,
          status: req.status,
        });
      }

      return { id: req.id, ok: true };
    }

    default:
      return { id: (req as { id?: number }).id, error: 'unknown', message: 'unknown command' };
  }
}

function formatUptime(createdAt: number): string {
  const secs = Math.floor((Date.now() - createdAt) / 1000);
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  return `${Math.floor(secs / 3600)}h`;
}

app.whenReady().then(async () => {
  // Init database BEFORE socket server — requests need the db.
  const dbPath = getDbPath(projectCwd);
  const database = initDatabase(dbPath);
  initSessionStore(database);
  initNapkinStore(database, projectCwd);

  // ── Reconciliation: filesystem walk vs SQLite ──
  const nepicsBase0 = path.join(projectCwd, '.nap', 'nepics');
  try {
    const nepicDirs0 = fs.readdirSync(nepicsBase0).filter((d) => {
      try {
        return fs.statSync(path.join(nepicsBase0, d)).isDirectory();
      } catch {
        return false;
      }
    });
    for (const d of nepicDirs0) {
      reconcile(path.join(nepicsBase0, d), database);
    }
  } catch {
    // .nap/nepics/ doesn't exist yet — no reconciliation needed
  }

  // ── Architect auto-resume ──
  try {
    const savedState = loadUiState();
    if (savedState?.activeNepicId) {
      const architect = getArchitectForNepic(savedState.activeNepicId);
      if (architect) {
        resumedArchitectSession = architect;
        const uuid = architect.ccSessionUuid;
        const command = uuid ? `claude --verbose --resume ${uuid}` : 'claude --verbose';
        architectResumeId = uuid ? architect.id : null;
        architectResumeTime = Date.now();
        architectResumeCwd = architect.cwd;
        createPtyProcess(architect.id, { command, cwd: architect.cwd });
      }
    }
  } catch {
    // Resume is best-effort — proceed without it
  }

  // Expose internals for Playwright tests (session-store uses native modules
  // compiled for Electron's ABI — vitest can't load them)
  if (process.env.NAP_TEST) {
    globalThis.__napTest = {
      createSession,
      getSession,
      getAllSessions,
      setSessionStatus,
      setSessionDone,
      removeSession,
      saveUiState,
      loadUiState,
      getArchitectForNepic,
      changeNapkinStatus,
      getAllNapkinStatuses,
      readNapkinDir,
      reconcile,
      startNapkinWatcher,
      stopNapkinWatcher,
      createNepicRow,
      getAllNepics,
      setNepicActive,
      getNepicById,
      getNapkinStatusesForNepic,
      handleNepicCreate,
      killAllPtys,
      /** Dispose ALL handlers (data+exit) then kill — safe for immediate app.quit() */
      teardownPtys: () => {
        for (const entry of ptys.values()) {
          entry.dataDisposable.dispose();
          entry.exitDisposable.dispose();
          entry.process.kill();
        }
        ptys.clear();
        pendingExits = 0;
      },
      SCHEMA,
      Database,
      getDb: () => database,
      getLivePtyIds: () => [...ptys.keys()],
      path,
      fs,
      os,
    };
  }

  // Start socket server BEFORE creating the window.
  // If another instance is running, quit immediately without creating
  // any windows — creating a window then quitting mid-init causes a
  // V8 HandleScope segfault on macOS (race between window close and V8 teardown).
  setWriter(writeToPty);

  try {
    await startSocketServer(handleSocketRequest, socketPath);
  } catch (err) {
    if ((err as Error).message.includes('Another instance')) {
      if (!process.env['NAP_TEST']) {
        dialog.showErrorBox('Nap', 'Another instance of Nap is already running.');
      }
      app.quit();
      return;
    }
    console.error('Failed to start socket server:', err);
  }

  buildMenu();
  createWindow();

  // Start napkin filesystem watcher after window is created
  // nepicDir: default to the first nepic found in .nap/nepics/
  const nepicsBase = path.join(projectCwd, '.nap', 'nepics');
  try {
    const nepicDirs = fs.readdirSync(nepicsBase).filter((d) => {
      try {
        return fs.statSync(path.join(nepicsBase, d)).isDirectory();
      } catch {
        return false;
      }
    });
    if (nepicDirs.length > 0 && mainWindow) {
      const nepicDir = path.join(nepicsBase, nepicDirs[0]);
      startNapkinWatcher(nepicDir, mainWindow);

      // Send initial napkin statuses from SQLite
      try {
        const statuses = getAllNapkinStatuses();
        for (const { slug, status } of statuses) {
          mainWindow.webContents.send('napkin:status-changed', { slug, status });
        }
      } catch {
        // no napkin rows yet — fine
      }
    }
  } catch {
    // .nap/nepics/ doesn't exist yet — no watcher needed
  }
});

// Signal handlers for socket cleanup
process.on('SIGTERM', () => {
  stopSocketServer();
  app.quit();
});

process.on('SIGINT', () => {
  stopSocketServer();
  app.quit();
});

process.on('beforeExit', () => {
  stopSocketServer();
});

app.on('before-quit', () => {
  try {
    saveUiState(trackedUiState);
  } catch {
    // DB may already be closed in edge cases — don't block quit
  }
});

app.on('will-quit', () => {
  stopNapkinWatcher();
  stopSocketServer();
  closeNapkinStore();
  closeSessionStore();
  closeDatabase();
});

app.on('window-all-closed', () => {
  // Kill all ptys, then wait for their onExit callbacks to fire
  // before quitting. This ensures node-pty's ThreadSafeFunction
  // completes its work before V8 tears down.
  killAllPtys();
  if (pendingExits === 0) {
    app.quit();
  } else {
    quitAfterExits = true;
    // Safety timeout — don't hang forever if a pty refuses to die
    setTimeout(() => app.quit(), 2000);
  }
});
