export interface StartRequest {
  type: 'start';
  id: number;
  name: string;
  prompt?: string;
  nepicId?: string;
}

export interface PsRequest {
  type: 'ps';
  id: number;
  json?: boolean;
}

export interface PeekRequest {
  type: 'peek';
  id: number;
  name: string;
}

export interface StopRequest {
  type: 'stop';
  id: number;
  name: string;
}

export interface PokeRequest {
  type: 'poke';
  id: number;
  name: string;
  message: string;
}

export interface DoneRequest {
  type: 'done';
  id: number;
  sessionId: string;
}

export interface LogRequest {
  type: 'log';
  id: number;
  name: string;
}

export interface CreateNapkinRequest {
  type: 'create-napkin';
  id: number;
  slug: string;
  status?: string;
  nepicId?: string;
}

export interface CreateAgentRequest {
  type: 'create-agent';
  id: number;
  napkinSlug: string;
  name: string;
  role: string;
  nepicId?: string;
}

export interface CreateArchitectRequest {
  type: 'create-architect';
  id: number;
  name: string;
  nepicId?: string;
}

export interface CreateNepicRequest {
  type: 'create-nepic';
  id: number;
  slug: string;
  displayName: string;
}

export interface SetStatusRequest {
  type: 'set-status';
  id: number;
  napkinSlug: string;
  status: string;
}

export interface StatusInspectRequest {
  type: 'status';
  id: number;
  query: { napkin?: string; agent?: string; nepic?: string };
}

export interface KeyRequest {
  type: 'key';
  id: number;
  name: string;
  data: string;
}

export interface NapWaitRequest {
  type: 'nap-wait';
  id: number;
  name: string;
}

export interface HookPermissionRequest {
  type: 'hook-permission-request';
  id: number;
  agentId: string;
  tool: string;
  command: string;
  payload: object;
}

export interface PermissionResponseRequest {
  type: 'permission-response';
  id: number;
  agentId: string;
  decision: 'allow' | 'deny';
}

export type SocketRequest =
  | StartRequest
  | PsRequest
  | PeekRequest
  | StopRequest
  | PokeRequest
  | DoneRequest
  | LogRequest
  | CreateNapkinRequest
  | CreateAgentRequest
  | CreateArchitectRequest
  | CreateNepicRequest
  | SetStatusRequest
  | StatusInspectRequest
  | KeyRequest
  | NapWaitRequest
  | HookPermissionRequest
  | PermissionResponseRequest;
