import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Snapshot bridge (0100) ──
  onSnapshot: (cb: (snapshot: unknown) => void) => {
    ipcRenderer.on('app:state', (_event, snapshot) => {
      cb(snapshot);
    });
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
});
