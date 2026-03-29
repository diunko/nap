export interface StartRequest {
  type: 'start';
  id: number;
  command: string;
  name?: string;
  cwd?: string;
  parentId?: string | null;
  napkinSlug?: string;
  role?: string;
  homeDir?: string;
  isClaude?: boolean;
}

export interface PsRequest {
  type: 'ps';
  id: number;
}

export interface PeekRequest {
  type: 'peek';
  id: number;
  name: string;
}

export interface KillRequest {
  type: 'kill';
  id: number;
  name: string;
}

export interface CloseRequest {
  type: 'close';
  id: number;
  name: string;
}

export interface PokeRequest {
  type: 'poke';
  id: number;
  name: string;
  message: string;
}

export interface StatusRequest {
  type: 'status';
  id: number;
  name: string;
}

export interface DoneRequest {
  type: 'done';
  id: number;
  sessionId: string;
  message: string;
}

export interface LogRequest {
  type: 'log';
  id: number;
  name: string;
}

export interface NapkinStatusRequest {
  type: 'napkin-status';
  id: number;
  napkinSlug: string;
  status: string;
}

export type SocketRequest =
  | StartRequest
  | PsRequest
  | PeekRequest
  | KillRequest
  | CloseRequest
  | PokeRequest
  | StatusRequest
  | DoneRequest
  | LogRequest
  | NapkinStatusRequest;
