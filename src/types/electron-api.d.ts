interface ResumeSessionData {
  id: string;
  name: string;
  role?: string;
  napkinSlug?: string;
  ccSessionUuid?: string;
  parentId?: string | null;
  cwd?: string;
}

interface ResumeData {
  architectSession: ResumeSessionData | null;
  orphanedSessions: ResumeSessionData[];
}

interface ElectronPtyAPI {
  create: (id: string, opts?: { name?: string; parentId?: string; cwd?: string; command?: string }) => void;
  kill: (id: string) => void;
  close: (id: string) => void;
  ready: (id: string) => void;
  onData: (callback: (id: string, data: string) => void) => () => void;
  onExit: (callback: (id: string, exitCode: number) => void) => () => void;
  write: (id: string, data: string) => void;
  resize: (id: string, cols: number, rows: number) => void;
  resume: (id: string, ccSessionUuid: string) => void;
}

interface NepicInfo {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
}

interface CreateNepicResult {
  nepic: { id: string; name: string; slug: string };
  architectSession: {
    id: string;
    name: string;
    role: string;
    cwd: string;
    ccSessionUuid: string;
  };
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
  getInitialNapkins: () => Promise<{
    napkins: { slug: string; artifacts: string[]; agents: { name: string; files: string[] }[]; napkinBullets: string[] }[];
    statuses: { slug: string; status: string }[];
    napkinsBasePath: string | null;
  }>;
  getInitialTerminalOpts: () => Promise<{ name: string; command?: string }>;
  sendUiState: (state: { activeNepicId: string | null; activeTerminalId: string | null; sidebarVisible: boolean }) => void;
  getUiState: () => Promise<{ activeNepicId: string | null; activeTerminalId: string | null; sidebarVisible: boolean } | null>;
  getResumeData: () => Promise<ResumeData>;
  createNepic: (name: string) => Promise<CreateNepicResult>;
  getNepics: () => Promise<NepicInfo[]>;
  switchNepic: (nepicId: string) => Promise<{
    architectSessionId: string | null;
    napkinStatuses: { slug: string; status: string }[];
    napkinsBasePath: string;
  }>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
