import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { join } from 'path';
import { createModel } from './model';
import { NodeFileSystem } from './filesystem';
import { NodePtySpawner } from './node-pty-spawner';
import { startAgents } from './coordinators';
import { startSocketServer, stopSocketServer } from './socket-server';
import { createRequestHandler } from './socket-handler';
import { setWriter } from './message-queue';
import { getServerSocketPath } from '../shared/constants';
import type { AppSnapshot } from '../shared/bridge-types';

let ptySpawner: NodePtySpawner | null = null;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#1e1e1e',
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

  const nepicDirs = await fs.readdir(nepicsBase);
  if (nepicDirs.length > 0) {
    activeNepicId = nepicDirs[nepicDirs.length - 1];
    activeNepicDir = join(nepicsBase, activeNepicId);
  }

  // Wire model → IPC bridge
  model.onChange(() => {
    if (win.isDestroyed()) return;
    const snapshot: AppSnapshot = {
      napkins: model.getNapkins(),
      architects: model.getArchitects(),
      activeNepicId,
      watcherEvents: model.getWatcherEvents(),
    };
    win.webContents.send('app:state', snapshot);
  });

  // Wire renderer intents → main
  ipcMain.on('app:intent', (_event, intent) => {
    if (intent?.type === 'setActiveTerminal') {
      // Terminal management
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

    ptySpawner.spawn({
      id: agent.id,
      command: `claude --verbose --resume ${agent.id}`,
      cwd: '',
    });

    ptySpawner.onExit(agent.id, () => {
      return model.setAgentExitedById(agent.id);
    });

    model.setAgentRunning(agent.id, true);
  });

  // Open file in default editor
  ipcMain.on('open-file-path', (_event, filePath: string) => {
    shell.openPath(filePath);
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

  // Register did-finish-load BEFORE async ops so it isn't missed
  win.webContents.on('did-finish-load', () => {
    if (activeNepicDir) {
      const snapshot: AppSnapshot = {
        napkins: model.getNapkins(),
        architects: model.getArchitects(),
        activeNepicId,
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
