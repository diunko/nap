import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'path';
import { createModel } from './model';
import { NodeFileSystem } from './filesystem';
import type { AppSnapshot } from '../shared/bridge-types';

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
  const win = createWindow();

  // Resolve nepic dir — look for .nap/nepics/ in project cwd
  const projectCwd = process.env['NAP_CWD'] || process.cwd();
  const fs = new NodeFileSystem();
  const model = createModel(fs);

  // Expose model for medium tests
  if (process.env['NAP_TEST'] === '1') {
    (global as any).__napModel__ = model;
  }

  // Find the active nepic directory
  const nepicsBase = join(projectCwd, '.nap', 'nepics');
  let activeNepicId = '';
  let activeNepicDir = '';

  const nepicDirs = await fs.readdir(nepicsBase);
  if (nepicDirs.length > 0) {
    // Use the first nepic (or the one from env/args — for now, first)
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
    };
    win.webContents.send('app:state', snapshot);
  });

  // Wire renderer intents → main
  ipcMain.on('app:intent', (_event, intent) => {
    if (intent?.type === 'setActiveTerminal') {
      // Will be wired to terminal management in later napkins
    }
  });

  // Load model from filesystem (triggers onChange → pushes snapshot to renderer)
  if (activeNepicDir) {
    await model.loadFromFilesystem(activeNepicDir);
    model.startWatching(activeNepicDir);
  }

  // Also push snapshot when renderer signals it's ready (handles race condition)
  win.webContents.on('did-finish-load', () => {
    if (activeNepicDir) {
      const snapshot: AppSnapshot = {
        napkins: model.getNapkins(),
        architects: model.getArchitects(),
        activeNepicId,
      };
      win.webContents.send('app:state', snapshot);
    }
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
