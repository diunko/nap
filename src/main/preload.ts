import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  pty: {
    create: (id: string, opts?: { name?: string; parentId?: string; cwd?: string; command?: string }) =>
      ipcRenderer.send('pty:create', id, opts),
    kill: (id: string) => ipcRenderer.send('pty:kill', id),
    close: (id: string) => ipcRenderer.send('pty:close', id),
    ready: (id: string) => ipcRenderer.send('pty:ready', id),
    onData: (callback: (id: string, data: string) => void) => {
      const handler = (_event: IpcRendererEvent, id: string, data: string) => callback(id, data);
      ipcRenderer.on('pty:data', handler);
      return () => ipcRenderer.removeListener('pty:data', handler);
    },
    onExit: (callback: (id: string, exitCode: number) => void) => {
      const handler = (_event: IpcRendererEvent, id: string, exitCode: number) =>
        callback(id, exitCode);
      ipcRenderer.on('pty:exit', handler);
      return () => ipcRenderer.removeListener('pty:exit', handler);
    },
    write: (id: string, data: string) => ipcRenderer.send('pty:write', id, data),
    resize: (id: string, cols: number, rows: number) =>
      ipcRenderer.send('pty:resize', id, cols, rows),
  },
  onToggleSidebar: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('sidebar:toggle', handler);
    return () => ipcRenderer.removeListener('sidebar:toggle', handler);
  },
  onCreateTerminal: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('terminal:create', handler);
    return () => ipcRenderer.removeListener('terminal:create', handler);
  },
  onCloseActiveTerminal: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('terminal:close-active', handler);
    return () => ipcRenderer.removeListener('terminal:close-active', handler);
  },
  onToggleScrollLock: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('scroll-lock:toggle', handler);
    return () => ipcRenderer.removeListener('scroll-lock:toggle', handler);
  },
  onToggleKanban: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('kanban:toggle', handler);
    return () => ipcRenderer.removeListener('kanban:toggle', handler);
  },
  onSocketTerminalCreated: (
    callback: (data: { id: string; name: string; parentId?: string | null; cwd?: string; role?: string; napkinSlug?: string }) => void,
  ) => {
    const handler = (
      _event: IpcRendererEvent,
      data: { id: string; name: string; parentId?: string | null; cwd?: string; role?: string; napkinSlug?: string },
    ) => callback(data);
    ipcRenderer.on('socket:terminal-created', handler);
    return () => ipcRenderer.removeListener('socket:terminal-created', handler);
  },
  onSocketPeek: (callback: (data: { id: string }) => void) => {
    const handler = (_event: IpcRendererEvent, data: { id: string }) => callback(data);
    ipcRenderer.on('socket:peek', handler);
    return () => ipcRenderer.removeListener('socket:peek', handler);
  },
  onSocketTerminalClose: (callback: (data: { id: string }) => void) => {
    const handler = (_event: IpcRendererEvent, data: { id: string }) => callback(data);
    ipcRenderer.on('socket:terminal-close', handler);
    return () => ipcRenderer.removeListener('socket:terminal-close', handler);
  },
  onSocketStatusChanged: (callback: (data: { id: string; status: string }) => void) => {
    const handler = (_event: IpcRendererEvent, data: { id: string; status: string }) =>
      callback(data);
    ipcRenderer.on('socket:status-changed', handler);
    return () => ipcRenderer.removeListener('socket:status-changed', handler);
  },
  onNapkinStatusChanged: (callback: (data: { slug: string; status: string }) => void) => {
    const handler = (_event: IpcRendererEvent, data: { slug: string; status: string }) =>
      callback(data);
    ipcRenderer.on('napkin:status-changed', handler);
    return () => ipcRenderer.removeListener('napkin:status-changed', handler);
  },
  onNapkinUpdate: (callback: (data: unknown) => void) => {
    const handler = (_event: IpcRendererEvent, data: unknown) => callback(data);
    ipcRenderer.on('napkin:update', handler);
    return () => ipcRenderer.removeListener('napkin:update', handler);
  },
  onLogRequest: (callback: (data: { id: string; requestId: number }) => void) => {
    const handler = (
      _event: IpcRendererEvent,
      data: { id: string; requestId: number },
    ) => callback(data);
    ipcRenderer.on('socket:log-request', handler);
    return () => ipcRenderer.removeListener('socket:log-request', handler);
  },
  sendLogResponse: (requestId: number, lines: string[]) =>
    ipcRenderer.send('socket:log-response', requestId, lines),
  openFilePath: (filePath: string) => ipcRenderer.send('open-file-path', filePath),
  getInitialTerminalOpts: () => ipcRenderer.invoke('get-initial-terminal-opts') as Promise<{ name: string; command?: string }>,
});
