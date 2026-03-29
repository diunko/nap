import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  onSnapshot: (cb: (snapshot: unknown) => void) => {
    ipcRenderer.on('app:state', (_event, snapshot) => {
      cb(snapshot);
    });
  },
  sendIntent: (intent: unknown) => {
    ipcRenderer.send('app:intent', intent);
  },
});
