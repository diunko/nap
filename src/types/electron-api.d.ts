interface ElectronPtyAPI {
  create: (id: string, opts?: { name?: string; parentId?: string; cwd?: string; command?: string }) => void;
  kill: (id: string) => void;
  close: (id: string) => void;
  ready: (id: string) => void;
  onData: (callback: (id: string, data: string) => void) => () => void;
  onExit: (callback: (id: string, exitCode: number) => void) => () => void;
  write: (id: string, data: string) => void;
  resize: (id: string, cols: number, rows: number) => void;
}

interface ElectronAPI {
  pty: ElectronPtyAPI;
  onToggleSidebar: (callback: () => void) => () => void;
  onToggleKanban: (callback: () => void) => () => void;
  onCreateTerminal: (callback: () => void) => () => void;
  onCloseActiveTerminal: (callback: () => void) => () => void;
  onToggleScrollLock: (callback: () => void) => () => void;
  onSocketTerminalCreated: (
    callback: (data: { id: string; name: string; parentId?: string | null; cwd?: string; role?: string; napkinSlug?: string }) => void,
  ) => () => void;
  onSocketPeek: (callback: (data: { id: string }) => void) => () => void;
  onSocketTerminalClose: (callback: (data: { id: string }) => void) => () => void;
  onSocketStatusChanged: (callback: (data: { id: string; status: string }) => void) => () => void;
  onNapkinUpdate: (callback: (data: unknown) => void) => () => void;
  onNapkinStatusChanged: (callback: (data: { slug: string; status: string }) => void) => () => void;
  onLogRequest: (
    callback: (data: { id: string; requestId: number }) => void,
  ) => () => void;
  sendLogResponse: (requestId: number, lines: string[]) => void;
  openFilePath: (filePath: string) => void;
  getInitialTerminalOpts: () => Promise<{ name: string; command?: string }>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
