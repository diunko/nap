import type {
  createSession,
  getSession,
  getAllSessions,
  setSessionStatus,
  setSessionDone,
  removeSession,
} from '../main/session-store';
import type { changeNapkinStatus } from '../main/napkin-store';
import type { readNapkinDir, startNapkinWatcher, stopNapkinWatcher } from '../main/napkin-watcher';
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
  changeNapkinStatus: typeof changeNapkinStatus;
  readNapkinDir: typeof readNapkinDir;
  startNapkinWatcher: typeof startNapkinWatcher;
  stopNapkinWatcher: typeof stopNapkinWatcher;
  SCHEMA: string;
  Database: typeof Database;
  getDb: () => Database.Database;
  path: typeof path;
  fs: typeof fs;
  os: typeof os;
}

declare global {
  var __napTest: NapTestHelpers | undefined;
}

export {};
