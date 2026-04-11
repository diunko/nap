import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';

// Buffer snapshots that arrive before the renderer registers its callback.
// Fixes race: main sends app:state during loadFromFilesystem/startAgents,
// but React hasn't mounted yet so the callback isn't registered.
let pendingSnapshot: unknown = null;
let snapshotCallback: ((snapshot: unknown) => void) | null = null;

ipcRenderer.on('app:state', (_event, snapshot) => {
  if (snapshotCallback) {
    snapshotCallback(snapshot);
  } else {
    pendingSnapshot = snapshot;
  }
});

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Snapshot bridge (0100) ──
  onSnapshot: (cb: (snapshot: unknown) => void) => {
    snapshotCallback = cb;
    if (pendingSnapshot !== null) {
      cb(pendingSnapshot);
      pendingSnapshot = null;
    }
  },
  sendIntent: (intent: unknown) => {
    ipcRenderer.send('app:intent', intent);
  },

  // ── PTY channels (0200) ──
  pty: {
    write: (id: string, data: string) => ipcRenderer.send('pty:write', id, data),
    resize: (id: string, cols: number, rows: number) =>
      ipcRenderer.send('pty:resize', id, cols, rows),
    ready: (id: string) => ipcRenderer.send('pty:ready', id),
    resume: (id: string) => ipcRenderer.send('pty:resume', id),
    onData: (callback: (id: string, data: string) => void) => {
      const handler = (_event: IpcRendererEvent, id: string, data: string) =>
        callback(id, data);
      ipcRenderer.on('pty:data', handler);
      return () => ipcRenderer.removeListener('pty:data', handler);
    },
    onExit: (callback: (id: string, exitCode: number) => void) => {
      const handler = (_event: IpcRendererEvent, id: string, exitCode: number) =>
        callback(id, exitCode);
      ipcRenderer.on('pty:exit', handler);
      return () => ipcRenderer.removeListener('pty:exit', handler);
    },
  },

  // ── File opener ──
  openFilePath: (filePath: string) => ipcRenderer.send('open-file-path', filePath),

  // ── UI state persistence ──
  saveUiState: (state: unknown) => ipcRenderer.send('save-ui-state', state),
  loadUiState: () => ipcRenderer.invoke('load-ui-state'),

  // ── Nepic management (0500) ──
  switchNepic: (id: string) => ipcRenderer.invoke('nepic:switch', id),
  createNepic: (name: string) => ipcRenderer.invoke('nepic:create', name),

  // ── Napkin status ──
  setNapkinStatus: (slug: string, status: string) => ipcRenderer.invoke('napkin:set-status', slug, status),

  // ── Agent successor (0620) ──
  spawnSuccessor: (id: string) => ipcRenderer.invoke('agent:spawn-successor', id),
});
