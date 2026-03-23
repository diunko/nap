import type {
  createSession,
  getSession,
  getAllSessions,
  setSessionStatus,
  setSessionDone,
  removeSession,
  saveUiState,
  loadUiState,
  getArchitectForNepic,
  createNepicRow,
  getAllNepics,
  setNepicActive,
  getNepicById,
} from '../main/session-store';
import type { changeNapkinStatus, getAllNapkinStatuses, getNapkinStatusesForNepic } from '../main/napkin-store';
import type { readNapkinDir, startNapkinWatcher, stopNapkinWatcher } from '../main/napkin-watcher';
import type { reconcile } from '../main/reconcile';
import type Database from 'better-sqlite3';
import type * as path from 'path';
import type * as fs from 'fs';
import type * as os from 'os';

interface NapTestHelpers {
  createSession: typeof createSession;
  getSession: typeof getSession;
  getAllSessions: typeof getAllSessions;
  setSessionStatus: typeof setSessionStatus;
  setSessionDone: typeof setSessionDone;
  removeSession: typeof removeSession;
  saveUiState: typeof saveUiState;
  loadUiState: typeof loadUiState;
  getArchitectForNepic: typeof getArchitectForNepic;
  changeNapkinStatus: typeof changeNapkinStatus;
  getAllNapkinStatuses: typeof getAllNapkinStatuses;
  readNapkinDir: typeof readNapkinDir;
  startNapkinWatcher: typeof startNapkinWatcher;
  stopNapkinWatcher: typeof stopNapkinWatcher;
  reconcile: typeof reconcile;
  createNepicRow: typeof createNepicRow;
  getAllNepics: typeof getAllNepics;
  setNepicActive: typeof setNepicActive;
  getNepicById: typeof getNepicById;
  getNapkinStatusesForNepic: typeof getNapkinStatusesForNepic;
  handleNepicCreate: (name: string) => {
    nepic: { id: string; name: string; slug: string };
    architectSession: { id: string; name: string; role: string; cwd: string; ccSessionUuid: string };
  };
  SCHEMA: string;
  Database: typeof Database;
  getDb: () => Database.Database;
  getLivePtyIds: () => string[];
  killAllPtys: () => void;
  teardownPtys: () => void;
  path: typeof path;
  fs: typeof fs;
  os: typeof os;
}

declare global {
  var __napTest: NapTestHelpers | undefined;
}

export {};
