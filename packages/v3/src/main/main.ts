import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { join, dirname } from 'path';
import * as nodeFs from 'fs';
import * as nodeFsPromises from 'fs/promises';
import { execFile } from 'child_process';
import { createModel } from './model';
import { NodeFileSystem } from './filesystem';
import { NodePtySpawner } from './node-pty-spawner';
import { startAgents, RESUME_FAIL_THRESHOLD_MS } from './coordinators';
import { startSocketServer, stopSocketServer } from './socket-server';
import { createRequestHandler } from './socket-handler';
import { setWriter } from './message-queue';
import { getServerSocketPath } from '../shared/constants';
import { ContentWatcher } from './content-watcher';
import { parseGitDiff } from './git-diff-parser';
import type { AppSnapshot } from '../shared/bridge-types';

let ptySpawner: NodePtySpawner | null = null;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#1e1e1e',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  win.once('ready-to-show', () => {
    if (!process.env['NAP_TEST'] || process.env['HEADED']) win.show();
  });

  return win;
}

app.whenReady().then(async () => {
  const isTest = process.env['NAP_TEST'] === '1';

  // Resolve nepic dir — look for .nap/nepics/ in project cwd
  const projectCwd = process.env['NAP_CWD'] || process.cwd();
  const fs = new NodeFileSystem();
  const model = createModel(fs);

  // ── Start socket server BEFORE window creation ──
  const socketPath = getServerSocketPath(projectCwd);
  ptySpawner = new NodePtySpawner(isTest);
  const handler = createRequestHandler(model, ptySpawner);
  await startSocketServer(handler, socketPath);

  // Wire message queue to pty writer
  setWriter((id, data) => {
    ptySpawner?.write(id, data);
  });

  const win = createWindow();

  // Expose model for medium tests
  if (isTest) {
    (global as any).__napModel__ = model;
  }

  // Find the active nepic directory
  const nepicsBase = join(projectCwd, '.nap', 'nepics');
  let activeNepicId = '';
  let activeNepicDir = '';

  const nepicDirEntries = await fs.readdir(nepicsBase);
  const nepicDirs = [];
  for (const d of nepicDirEntries) {
    if (d.startsWith('.') || d === 'ui-state.json') continue;
    if (await fs.isDirectory(join(nepicsBase, d))) nepicDirs.push(d);
  }
  if (nepicDirs.length > 0) {
    activeNepicId = nepicDirs[nepicDirs.length - 1];
    activeNepicDir = join(nepicsBase, activeNepicId);
  }

  // Wire model → IPC bridge
  model.onChange(() => {
    if (win.isDestroyed()) return;
    activeNepicId = model.getActiveNepicId();
    const snapshot: AppSnapshot = {
      napkins: model.getNapkins(),
      architects: model.getArchitects(),
      activeNepicId,
      nepics: model.getNepics(),
      watcherEvents: model.getWatcherEvents(),
    };
    win.webContents.send('app:state', snapshot);
  });

  // Wire renderer intents → main
  ipcMain.on('app:intent', async (_event, intent) => {
    if (intent?.type === 'setActiveTerminal') {
      // Terminal management
    }
    if (intent?.type === 'permission-response') {
      // Resolve via the same socket handler path
      const agentId = intent.agentId as string;
      const decision = intent.decision as string;
      try {
        await handler({ type: 'permission-response', id: 0, agentId, decision }, null as any);
      } catch {
        // No pending approval — ignore
      }
    }
  });

  // ── PTY management ──

  // Route pty data → renderer
  ptySpawner.setDataHandler((id, data) => {
    if (!win.isDestroyed()) {
      win.webContents.send('pty:data', id, data);
    }
  });

  // Route pty exits → renderer
  ptySpawner.setExitNotifier((id, exitCode) => {
    if (!win.isDestroyed()) {
      win.webContents.send('pty:exit', id, exitCode);
    }
  });

  // Wire pty IPC from renderer → main
  ipcMain.on('pty:write', (_event, id: string, data: string) => {
    ptySpawner?.write(id, data);
  });

  ipcMain.on('pty:resize', (_event, id: string, cols: number, rows: number) => {
    ptySpawner?.resize(id, cols, rows);
  });

  ipcMain.on('pty:ready', (_event, id: string) => {
    ptySpawner?.markReady(id);
  });

  // Resume an exited agent's pty on demand (user clicked it)
  ipcMain.on('pty:resume', (_event, id: string) => {
    if (!ptySpawner || ptySpawner.isRunning(id)) return;

    const agent = model.getAllAgents().find((a) => a.id === id);
    if (!agent) return;

    // Archived agents don't resume — they need the successor flow
    if (agent.archived) return;

    const spawnTime = Date.now();

    ptySpawner.spawn({
      id: agent.id,
      command: `claude --verbose --resume ${agent.id}`,
      cwd: '',
    });

    ptySpawner.onExit(agent.id, async () => {
      // Resume failure detection: fast exit + "No conversation found"
      if ((Date.now() - spawnTime) < RESUME_FAIL_THRESHOLD_MS) {
        const output = (ptySpawner as any).getOutputBuffer?.(agent.id) ?? '';
        if (output.includes('No conversation found')) {
          await model.setAgentArchived(agent.id);
          return;
        }
      }
      return model.setAgentExitedById(agent.id);
    });

    model.setAgentRunning(agent.id, true);
  });

  // Spawn successor for an archived agent
  ipcMain.handle('agent:spawn-successor', async (_event, id: string) => {
    if (!ptySpawner) return { error: true, message: 'no pty spawner' };
    const newId = await model.spawnSuccessor(id, ptySpawner);
    if (!newId) return { error: true, message: 'agent not found' };
    return { ok: true, newId };
  });

  // Set napkin status (archive/unarchive from kanban)
  ipcMain.handle('napkin:set-status', async (_event, slug: string, status: string) => {
    await model.setNapkinStatus(slug, status);
    return { ok: true };
  });

  // Open file in default editor
  ipcMain.on('open-file-path', (_event, filePath: string) => {
    shell.openPath(filePath);
  });

  // Open URL in default browser
  ipcMain.on('shell:open-external', (_event, url: string) => {
    shell.openExternal(url);
  });

  // ── File content IPC (0100 — content pane) ──

  ipcMain.handle('file:read', async (_event, filePath: string) => {
    try {
      return await nodeFsPromises.readFile(filePath, 'utf-8');
    } catch {
      return null;
    }
  });

  // Track pending writes for echo suppression
  const pendingContentWrites = new Set<string>();

  ipcMain.handle('file:write', async (_event, filePath: string, content: string) => {
    try {
      pendingContentWrites.add(filePath);
      await nodeFsPromises.writeFile(filePath, content);
      // Clear after debounce window so watcher doesn't echo
      setTimeout(() => pendingContentWrites.delete(filePath), 300);
      return { ok: true };
    } catch (err) {
      return { error: true, message: String(err) };
    }
  });

  // Per-file content watcher: renderer tells us which file to watch
  const contentWatcher = new ContentWatcher({
    onChange: (filePath, content) => {
      if (!win.isDestroyed()) {
        win.webContents.send('file:changed', filePath, content);
      }
    },
    isPendingWrite: (filePath) => pendingContentWrites.has(filePath),
  });

  ipcMain.on('file:watch', (_event, filePath: string | null) => {
    contentWatcher.watch(filePath);
  });

  // ── File exists check (0200 — link fallback resolution) ──

  ipcMain.handle('file:exists', async (_event, filePath: string) => {
    try {
      await nodeFsPromises.access(filePath);
      return true;
    } catch {
      return false;
    }
  });

  // ── Git diff (0200 — git gutter) ──

  ipcMain.handle('file:git-diff', async (_event, filePath: string) => {
    return new Promise<ReturnType<typeof parseGitDiff>>((resolve) => {
      // Check if file is tracked
      execFile('git', ['ls-files', '--error-unmatch', filePath], { cwd: dirname(filePath) }, (lsErr) => {
        if (lsErr) {
          // Untracked file — all lines are "added"
          nodeFsPromises.readFile(filePath, 'utf-8').then((content) => {
            const lineCount = content.split('\n').length;
            resolve(lineCount > 0 ? [{ type: 'add', startLine: 1, endLine: lineCount }] : []);
          }).catch(() => resolve([]));
          return;
        }

        // Tracked file — run git diff
        execFile(
          'git',
          ['diff', '--unified=0', 'HEAD', '--', filePath],
          { cwd: dirname(filePath), maxBuffer: 1024 * 1024 },
          (err, stdout) => {
            if (err && !stdout) {
              resolve([]);
              return;
            }
            resolve(parseGitDiff(stdout));
          },
        );
      });
    });
  });

  // ── Code file watcher (0200 — right pane) ──

  const codeWatcher = new ContentWatcher({
    onChange: (filePath, content) => {
      if (!win.isDestroyed()) {
        win.webContents.send('code:changed', filePath, content);
      }
    },
    isPendingWrite: () => false, // Code pane is read-only, no echo suppression
  });

  ipcMain.on('code:watch', (_event, filePath: string | null) => {
    codeWatcher.watch(filePath);
  });

  // UI state persistence (debug panel collapse/tab, sidebar visible)
  ipcMain.on('save-ui-state', (_event, state: unknown) => {
    model.saveUiState(state);
  });

  ipcMain.handle('load-ui-state', async () => {
    if (!activeNepicDir) return null;
    const fs = new NodeFileSystem();
    const uiStatePath = activeNepicDir + '/ui-state.json';
    return await fs.readJSON(uiStatePath);
  });

  // Expose pty manager for medium tests
  if (isTest) {
    (global as any).__napPtyManager__ = ptySpawner;
  }

  // IPC: switch active nepic
  ipcMain.handle('nepic:switch', async (_event, nepicId: string) => {
    await model.switchNepic(nepicId);
    activeNepicId = model.getActiveNepicId();
    activeNepicDir = model.getNepicDir();
    // Start any agents that need ptys (Case A resume, Case C fresh)
    if (ptySpawner) await startAgents(model, ptySpawner);
    return { ok: true };
  });

  // IPC: create a new nepic
  ipcMain.handle('nepic:create', async (_event, name: string) => {
    const nepics = model.getNepics();
    const nextNum = String(nepics.length + 1).padStart(2, '0');
    const slug = `${nextNum}-${name}`;
    const result = await model.createNepic(slug, name);
    // Switch to new nepic
    await model.switchNepic(slug);
    activeNepicId = model.getActiveNepicId();
    activeNepicDir = model.getNepicDir();
    // Auto-start the new architect (Case C — fresh)
    if (ptySpawner) await startAgents(model, ptySpawner);
    return {
      nepic: { id: slug, slug, name },
      architectId: result.architectId,
    };
  });

  // Register did-finish-load BEFORE async ops so it isn't missed
  win.webContents.on('did-finish-load', () => {
    if (activeNepicDir) {
      const snapshot: AppSnapshot = {
        napkins: model.getNapkins(),
        architects: model.getArchitects(),
        activeNepicId,
        nepics: model.getNepics(),
        watcherEvents: model.getWatcherEvents(),
      };
      win.webContents.send('app:state', snapshot);
    }
  });

  // Load model from filesystem (triggers onChange → pushes snapshot to renderer)
  if (activeNepicDir) {
    await model.loadFromFilesystem(activeNepicDir);

    // Start agents — spawns ptys, updates running flags
    await startAgents(model, ptySpawner);

    model.startWatching(activeNepicDir);
  }
});

// ── Quit handling ──

app.on('before-quit', () => {
  stopSocketServer();
  if (ptySpawner) {
    ptySpawner.clearExitHandlers();
    ptySpawner.killAll();
  }
});

app.on('window-all-closed', () => {
  app.quit();
});
