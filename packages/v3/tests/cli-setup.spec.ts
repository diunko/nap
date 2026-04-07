import { test, expect } from '@playwright/test';
import * as net from 'net';
import * as path from 'path';
import * as fs from 'fs';
import { execFileSync } from 'child_process';
import {
  launchApp,
  cleanupApp,
  makeTmpDir,
} from './helpers';
import type { ElectronApplication, Page } from '@playwright/test';

// ── CLI helpers ──

const cliPath = path.join(__dirname, '..', 'out', 'cli', 'cli', 'nap.js');

function runNapInit(cwd: string): void {
  execFileSync('node', [cliPath, 'init'], {
    cwd,
    timeout: 10000,
    encoding: 'utf8',
  });
}

function runNapSetup(cwd: string, args: string[]): void {
  execFileSync('node', [cliPath, 'setup', ...args], {
    cwd,
    timeout: 10000,
    encoding: 'utf8',
  });
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

// T-0670-27: imported project loads correctly in Electron app
test('T-0670-27: imported project loads in Electron after setup --import', async () => {
  const tmpDir = makeTmpDir();

  // Create a project manually: napkin dirs, agent dirs with prompt.md/response.md, no markers
  runNapInit(tmpDir);

  const nepicBase = path.join(tmpDir, '.nap', 'nepics', '01-v1');

  // Create unmarked napkin with two agents
  const napkinDir = path.join(nepicBase, '30-napkins', '0100-explore');
  fs.mkdirSync(napkinDir, { recursive: true });

  // Agent with prompt + response (done)
  const doneAgentDir = path.join(napkinDir, 'agents', '001-test-arch');
  fs.mkdirSync(doneAgentDir, { recursive: true });
  fs.writeFileSync(path.join(doneAgentDir, 'prompt.md'), 'test prompt');
  fs.writeFileSync(path.join(doneAgentDir, 'response.md'), 'test response');

  // Agent with prompt only (not done)
  const wipAgentDir = path.join(napkinDir, 'agents', '002-fs-eng');
  fs.mkdirSync(wipAgentDir, { recursive: true });
  fs.writeFileSync(path.join(wipAgentDir, 'prompt.md'), 'wip prompt');

  // Run import
  runNapSetup(tmpDir, ['--import']);

  // Verify markers exist on disk before launching app
  expect(fs.existsSync(path.join(napkinDir, '.napkin.nap.json'))).toBe(true);
  expect(fs.existsSync(path.join(doneAgentDir, '.agent.nap.json'))).toBe(true);
  expect(fs.existsSync(path.join(wipAgentDir, '.agent.nap.json'))).toBe(true);

  // Launch app
  const app = await launchApp(tmpDir);
  const page = await app.firstWindow();

  // Wait for store to populate
  await page.waitForFunction(
    () => {
      const store = (window as any).__napStore__?.getState();
      return store?.napkins?.length > 0;
    },
    { timeout: 15000 },
  );

  // Verify model shows imported napkins with correct data
  const state = await page.evaluate(() => {
    const s = (window as any).__napStore__.getState();
    const napkin = s.napkins.find((n: any) => n.slug === '0100-explore');
    if (!napkin) return null;
    return {
      napkinSlug: napkin.slug,
      napkinStatus: napkin.status,
      agentCount: napkin.agents?.length ?? 0,
      agents: (napkin.agents || []).map((a: any) => ({
        name: a.name,
        role: a.role,
        done: a.done,
      })),
    };
  });

  expect(state).not.toBeNull();
  expect(state!.napkinSlug).toBe('0100-explore');
  expect(state!.napkinStatus).toBe('backlog');
  expect(state!.agentCount).toBe(2);

  // Verify agent roles and done status
  const doneAgent = state!.agents.find((a: any) => a.name === '001-test-arch');
  const wipAgent = state!.agents.find((a: any) => a.name === '002-fs-eng');
  expect(doneAgent).toBeDefined();
  expect(doneAgent!.role).toBe('test-arch');
  expect(doneAgent!.done).toBe(true);
  expect(wipAgent).toBeDefined();
  expect(wipAgent!.role).toBe('fs-eng');
  expect(wipAgent!.done).toBe(false);

  await cleanupApp(app, tmpDir);
});

// T-0670-28: guardian installed via setup works with permission hook
test('T-0670-28: setup --guardian permission hook flow', async () => {
  const tmpDir = makeTmpDir();

  // Create project + guardian + an agent to request permissions
  runNapInit(tmpDir);

  const nepicBase = path.join(tmpDir, '.nap', 'nepics', '01-v1');

  // Create an agent that will request permissions
  const napkinDir = path.join(nepicBase, '30-napkins', '0100-explore');
  fs.mkdirSync(napkinDir, { recursive: true });
  fs.writeFileSync(
    path.join(napkinDir, '.napkin.nap.json'),
    JSON.stringify({ status: 'doing', nepic: '01-v1' }),
  );

  const agentDir = path.join(napkinDir, 'agents', '001-test-arch');
  fs.mkdirSync(agentDir, { recursive: true });
  fs.writeFileSync(path.join(agentDir, 'prompt.md'), 'test prompt');
  fs.writeFileSync(
    path.join(agentDir, '.agent.nap.json'),
    JSON.stringify({
      cc_session_uuid: 'uuid-ta',
      role: 'test-arch',
      name: '001-test-arch',
      napkin: '0100-explore',
      nepic: '01-v1',
      started: true,
      exited: false,
      created_at: Date.now(),
    }),
  );

  // Run setup --guardian
  runNapSetup(tmpDir, ['--guardian']);

  // Verify guardian marker exists on disk
  const guardianMarkerPath = path.join(nepicBase, '20-architects', '002-guardian', '.agent.nap.json');
  expect(fs.existsSync(guardianMarkerPath)).toBe(true);
  const guardianMarker = JSON.parse(fs.readFileSync(guardianMarkerPath, 'utf8'));
  expect(guardianMarker.role).toBe('guardian');

  // Verify settings.json has hook config
  const settingsPath = path.join(tmpDir, '.claude', 'settings.json');
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  expect(settings.hooks.PermissionRequest[0].command).toBe('nap3 hook permission-request');

  // Launch app
  const app = await launchApp(tmpDir);
  const page = await app.firstWindow();

  // Wait for store to populate
  await page.waitForFunction(
    () => {
      const store = (window as any).__napStore__?.getState();
      return store?.architects?.length > 0;
    },
    { timeout: 15000 },
  );

  // Mark both agents as running so the guardian can receive pokes
  await app.evaluate(({ }, ids) => {
    const model = (global as any).__napModel__;
    for (const id of ids) {
      model.setAgentRunning(id, true);
    }
  }, [guardianMarker.cc_session_uuid, 'uuid-ta']);

  // Get socket path
  const sockPath = path.join(tmpDir, '.nap', 'sock');

  // Send hook-permission-request via socket (like CC would)
  const hookConn = net.createConnection(sockPath);
  const hookResult = new Promise<Record<string, unknown>>((resolve) => {
    let buf = '';
    hookConn.on('data', (chunk) => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop()!;
      for (const line of lines) {
        const t = line.trim();
        if (!t) continue;
        try {
          const obj = JSON.parse(t);
          if (obj.type === 'ping') continue;
          resolve(obj);
        } catch { /* skip */ }
      }
    });
  });
  hookConn.on('connect', () => {
    hookConn.write(JSON.stringify({
      type: 'hook-permission-request',
      id: 1,
      agentId: 'uuid-ta',
      tool: 'Bash',
      command: 'npm install',
      payload: {},
    }) + '\n');
  });

  // Wait for pendingApproval to be set on the agent in the model
  await page.waitForFunction(
    (agentId) => {
      const s = (window as any).__napStore__?.getState();
      const napkins = s?.napkins || [];
      for (const n of napkins) {
        for (const a of n.agents || []) {
          if (a.id === agentId && a.pendingApproval) return true;
        }
      }
      return false;
    },
    'uuid-ta',
    { timeout: 5000 },
  );

  // Verify guardian was poked — check that the guardian's message queue got enqueued
  // (We can't directly observe the poke, but we can verify pendingApproval was set
  // which means the hook-permission-request was processed and guardian poke was attempted)
  const pendingSet = await app.evaluate(({ }, agentId) => {
    const model = (global as any).__napModel__;
    const agents = model.getAllAgents();
    const agent = agents.find((a: any) => a.id === agentId);
    return agent?.pendingApproval !== null && agent?.pendingApproval !== undefined;
  }, 'uuid-ta');

  expect(pendingSet).toBe(true);

  // Now resolve the permission via socket to clean up the long-lived connection
  await ndjsonSend(sockPath, {
    type: 'permission-response',
    id: 2,
    agentId: 'uuid-ta',
    decision: 'allow',
  });

  // Wait for hookResult to resolve
  const result = await hookResult;
  expect(result.decision).toBe('allow');

  hookConn.destroy();
  await cleanupApp(app, tmpDir);
});
