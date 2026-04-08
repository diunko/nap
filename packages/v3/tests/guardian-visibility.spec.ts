import { test, expect } from '@playwright/test';
import * as net from 'net';
import * as path from 'path';
import * as fs from 'fs';
import {
  launchApp,
  cleanupApp,
  makeTmpDir,
} from './helpers';
import type { ElectronApplication, Page } from '@playwright/test';

// ── Multi-nepic fixture: guardian in first nepic only ──

const F_GUARDIAN_MULTI: Record<string, object | string | null> = {
  // First nepic: architect + guardian
  '01-v1/30-napkins/0100-explore/.napkin.nap.json': { status: 'doing' },
  '01-v1/30-napkins/0100-explore/agents/001-fs-eng/.agent.nap.json': {
    cc_session_uuid: 'uuid-v1-fs',
    role: 'fs-eng',
    name: '001-fs-eng',
    nepic: '01-v1',
    created_at: 1711700000000,
    started: true,
    exited: false,
  },
  '01-v1/20-architects/001-architect/.agent.nap.json': {
    cc_session_uuid: 'uuid-v1-arch',
    role: 'architect',
    name: '001-architect',
    nepic: '01-v1',
    created_at: 1711600000000,
    started: true,
    exited: false,
  },
  '01-v1/20-architects/002-guardian/.agent.nap.json': {
    cc_session_uuid: 'uuid-guardian',
    role: 'guardian',
    name: '002-guardian',
    nepic: '01-v1',
    created_at: 1711600100000,
    started: true,
    exited: false,
  },
  '01-v1/20-architects/002-guardian/prompt.md': 'You are the guardian.',

  // Second nepic: architect only, no guardian
  '02-spaces/30-napkins/0100-design/.napkin.nap.json': { status: 'doing' },
  '02-spaces/30-napkins/0100-design/agents/001-fs-eng/.agent.nap.json': {
    cc_session_uuid: 'uuid-s-fs',
    role: 'fs-eng',
    name: '001-fs-eng',
    nepic: '02-spaces',
    created_at: 1711700000000,
    started: true,
    exited: false,
  },
  '02-spaces/20-architects/001-architect/.agent.nap.json': {
    cc_session_uuid: 'uuid-s-arch',
    role: 'architect',
    name: '001-architect',
    nepic: '02-spaces',
    created_at: 1711600000000,
    started: true,
    exited: false,
  },
};

function createMultiNepicTestDir(
  tmpDir: string,
  fixture: Record<string, object | string | null>,
): void {
  const nepicsBase = path.join(tmpDir, '.nap', 'nepics');

  for (const [filePath, content] of Object.entries(fixture)) {
    const fullPath = path.join(nepicsBase, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });

    if (content !== null) {
      if (typeof content === 'string') {
        fs.writeFileSync(fullPath, content);
      } else {
        fs.writeFileSync(fullPath, JSON.stringify(content, null, 2));
      }
    }
  }
}

// ── NDJSON socket helper ──

function ndjsonSend(
  socketPath: string,
  request: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const conn = net.createConnection(socketPath);
    conn.on('error', reject);

    let buffer = '';
    conn.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop()!;
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const obj = JSON.parse(trimmed);
          resolve(obj);
          conn.destroy();
        } catch { /* skip malformed */ }
      }
    });

    conn.on('connect', () => {
      conn.write(JSON.stringify(request) + '\n');
    });
  });
}

function ndjsonSendLongLived(
  socketPath: string,
  request: Record<string, unknown>,
): { promise: Promise<Record<string, unknown>>; conn: net.Socket } {
  const conn = net.createConnection(socketPath);
  const promise = new Promise<Record<string, unknown>>((resolve, reject) => {
    conn.on('error', reject);
    let buffer = '';
    conn.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop()!;
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const obj = JSON.parse(trimmed);
          if ((obj as any).type === 'ping') continue;
          resolve(obj);
        } catch { /* skip */ }
      }
    });
    conn.on('connect', () => {
      conn.write(JSON.stringify(request) + '\n');
    });
  });
  return { promise, conn };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Boot helper ──

let app: ElectronApplication;
let page: Page;
let tmpDir: string;

async function boot(): Promise<string> {
  tmpDir = makeTmpDir();
  createMultiNepicTestDir(tmpDir, F_GUARDIAN_MULTI);
  app = await launchApp(tmpDir);
  page = await app.firstWindow();

  // Wait for model to finish loading (architects populated)
  await page.waitForFunction(
    () => {
      const store = (window as any).__napStore__?.getState();
      return store?.architects?.length > 0;
    },
    { timeout: 15000 },
  );

  // Small settle time for any async snapshot pushes
  await sleep(500);

  return path.join(tmpDir, '.nap', 'sock');
}

// T-0655-15: sidebar shows guardian after nepic switch (store-level check)
test('T-0655-15: guardian visible in store after loading non-home nepic', async () => {
  await boot();

  // App starts on 02-spaces (last alphabetically).
  // Guardian should be cross-loaded from 01-v1 into the model.
  const modelState = await app.evaluate(() => {
    const model = (global as any).__napModel__;
    return {
      activeNepicId: model.getActiveNepicId(),
      architects: model.getArchitects().map((a: any) => ({ id: a.id, role: a.role, nepicId: a.nepicId })),
    };
  });

  expect(modelState.activeNepicId).toBe('02-spaces');
  const guardian = modelState.architects.find((a: any) => a.role === 'guardian');
  expect(guardian).toBeTruthy();
  expect(guardian.id).toBe('uuid-guardian');
  expect(guardian.nepicId).toBe('01-v1');

  // App starts on 02-spaces (last alphabetically).
  // Guardian should be cross-loaded from 01-v1.
  const state = await page.evaluate(() => {
    const s = (window as any).__napStore__.getState();
    return {
      activeNepicId: s.activeNepicId,
      architects: s.architects.map((a: any) => ({
        id: a.id,
        role: a.role,
        nepicId: a.nepicId,
      })),
    };
  });

  expect(state.activeNepicId).toBe('02-spaces');

  const storeGuardian = state.architects.find((a: any) => a.role === 'guardian');
  expect(storeGuardian).toBeTruthy();
  expect(storeGuardian.nepicId).toBe('01-v1');
  expect(storeGuardian.id).toBe('uuid-guardian');

  // Exactly one guardian — no duplication
  const guardianCount = state.architects.filter((a: any) => a.role === 'guardian').length;
  expect(guardianCount).toBe(1);

  await cleanupApp(app, tmpDir);
});

// T-0655-16: guardian terminal accessible from non-home nepic
test('T-0655-16: guardian terminal selectable from non-home nepic', async () => {
  await boot();

  // Select guardian as active terminal
  await page.evaluate(() => {
    (window as any).__napStore__.getState().setActiveTerminal('uuid-guardian');
  });

  const activeTerminalId = await page.evaluate(() =>
    (window as any).__napStore__.getState().activeTerminalId,
  );
  expect(activeTerminalId).toBe('uuid-guardian');

  // Guardian exists in architect list — renderer can find it
  const guardian = await page.evaluate(() => {
    const s = (window as any).__napStore__.getState();
    return s.architects.find((a: any) => a.id === 'uuid-guardian');
  });
  expect(guardian).toBeTruthy();
  expect(guardian.role).toBe('guardian');

  await cleanupApp(app, tmpDir);
});

// T-0655-17: guardian permission cycle works from non-home nepic
test('T-0655-17: permission cycle with cross-loaded guardian', async () => {
  const sockPath = await boot();

  // Mark guardian as running in the model
  await app.evaluate(({}, guardianId) => {
    const model = (global as any).__napModel__;
    model.setAgentRunning(guardianId, true);
  }, 'uuid-guardian');

  // Fire hook-permission-request for an agent on nepic 02
  const { promise: hookPromise, conn: hookConn } = ndjsonSendLongLived(sockPath, {
    type: 'hook-permission-request',
    id: 1,
    agentId: 'uuid-s-fs',
    tool: 'Bash',
    command: 'npm install',
    payload: {},
  });

  await sleep(500);

  // Verify pendingApproval is set on the agent
  const hasPending = await app.evaluate(({}, agentId) => {
    const model = (global as any).__napModel__;
    const agents = model.getAllAgents();
    const agent = agents.find((a: any) => a.id === agentId);
    return agent?.pendingApproval !== null && agent?.pendingApproval !== undefined;
  }, 'uuid-s-fs');
  expect(hasPending).toBe(true);

  // Resolve permission via ndjson
  await ndjsonSend(sockPath, {
    type: 'permission-response',
    id: 2,
    agentId: 'uuid-s-fs',
    decision: 'allow',
  });

  // Hook should resolve with allow
  const hookResult = await hookPromise;
  expect(hookResult.decision).toBe('allow');

  hookConn.destroy();
  await cleanupApp(app, tmpDir);
});
