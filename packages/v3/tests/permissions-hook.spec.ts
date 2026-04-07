import { test, expect } from '@playwright/test';
import * as net from 'net';
import * as path from 'path';
import * as fs from 'fs';
import {
  launchApp,
  cleanupApp,
  makeTmpDir,
  createTestNepicDir,
  execNap,
} from './helpers';
import type { ElectronApplication, Page } from '@playwright/test';

// ── Fixture: F-0650-medium — project with agent that will get pendingApproval ──

const F_PERM_FIXTURE: Record<string, object | null> = {
  'nepic/30-napkins/0100-explore/.napkin.nap.json': { status: 'doing', nepic: 'test-nepic' },
  'nepic/30-napkins/0100-explore/agents/001-test-arch/.agent.nap.json': {
    cc_session_uuid: 'uuid-ta',
    role: 'test-arch',
    name: '001-test-arch',
    napkin: '0100-explore',
    nepic: 'test-nepic',
    parent: '001-architect',
    parent_id: 'uuid-arch',
    created_at: 1711700000000,
    started: true,
    exited: false,
  },
  'nepic/30-napkins/0100-explore/agents/002-fs-eng/.agent.nap.json': {
    cc_session_uuid: 'uuid-fs',
    role: 'fs-eng',
    name: '002-fs-eng',
    napkin: '0100-explore',
    nepic: 'test-nepic',
    parent: '001-test-arch',
    parent_id: 'uuid-ta',
    created_at: 1711700100000,
    started: true,
    exited: false,
  },
  'nepic/20-architects/001-architect/.agent.nap.json': {
    cc_session_uuid: 'uuid-arch',
    role: 'architect',
    name: '001-architect',
    nepic: 'test-nepic',
    created_at: 1711600000000,
    started: true,
    exited: false,
  },
};

// ── Helper: NDJSON socket communication ──

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

// ── Boot helper ──

let app: ElectronApplication;
let page: Page;
let tmpDir: string;

async function boot(): Promise<string> {
  tmpDir = makeTmpDir();
  createTestNepicDir(tmpDir, F_PERM_FIXTURE);
  app = await launchApp(tmpDir);
  page = await app.firstWindow();

  // Wait for store to populate
  await page.waitForFunction(
    () => {
      const store = (window as any).__napStore__?.getState();
      return store?.napkins?.length > 0;
    },
    { timeout: 15000 },
  );

  // Get socket path
  const sockPath = path.join(tmpDir, '.nap', 'sock');
  return sockPath;
}

// T-0650-20: permission request shows blinking dot in sidebar
test('T-0650-20: permission request shows blinking dot', async () => {
  const sockPath = await boot();

  // Set pendingApproval on uuid-ta via model directly (app.evaluate)
  await app.evaluate(({ }, agentId) => {
    const model = (global as any).__napModel__;
    model.setAgentPendingApproval(agentId, {
      tool: 'Bash',
      command: 'npm install',
      timestamp: Date.now(),
      payload: { tool_name: 'Bash' },
    });
  }, 'uuid-ta');

  // Wait for snapshot to reach renderer
  await page.waitForFunction(
    (agentId) => {
      const s = (window as any).__napStore__?.getState();
      const agents = s?.napkins?.[0]?.agents || [];
      const agent = agents.find((a: any) => a.id === agentId);
      return agent?.pendingApproval !== null && agent?.pendingApproval !== undefined;
    },
    'uuid-ta',
    { timeout: 5000 },
  );

  // Check that the agent dot has blink animation
  const animation = await page.evaluate(() => {
    const dots = document.querySelectorAll('[data-testid="agent-dot"]');
    for (const dot of dots) {
      const style = getComputedStyle(dot);
      if (style.animation.includes('blink')) {
        return style.animation;
      }
    }
    return null;
  });

  expect(animation).not.toBeNull();
  expect(animation).toContain('blink');

  await cleanupApp(app, tmpDir);
});

// T-0650-21: permission modal renders in terminal area
test('T-0650-21: permission modal renders in terminal area', async () => {
  const sockPath = await boot();

  // Mark the agent as running and set active terminal
  await app.evaluate(({ }, agentId) => {
    const model = (global as any).__napModel__;
    model.setAgentRunning(agentId, true);
  }, 'uuid-ta');

  // Set active terminal to the agent
  await page.evaluate((agentId) => {
    (window as any).__napStore__.getState().setActiveTerminal(agentId);
  }, 'uuid-ta');

  // Set pendingApproval
  await app.evaluate(({ }, agentId) => {
    const model = (global as any).__napModel__;
    model.setAgentPendingApproval(agentId, {
      tool: 'Bash',
      command: 'npm install react',
      timestamp: Date.now(),
      payload: { tool_name: 'Bash', tool_input: { command: 'npm install react' } },
    });
  }, 'uuid-ta');

  // Wait for modal to appear
  await page.waitForFunction(
    () => document.querySelector('[data-testid="permission-modal"]') !== null,
    { timeout: 5000 },
  );

  // Verify modal content
  const modalText = await page.evaluate(() =>
    document.querySelector('[data-testid="permission-modal"]')?.textContent || '',
  );

  expect(modalText).toContain('Bash');
  expect(modalText).toContain('Approve');
  expect(modalText).toContain('Deny');

  await cleanupApp(app, tmpDir);
});

// T-0650-22: approve button resolves permission
test('T-0650-22: approve button resolves permission', async () => {
  const sockPath = await boot();

  // Set up agent running + active terminal
  await app.evaluate(({ }, agentId) => {
    const model = (global as any).__napModel__;
    model.setAgentRunning(agentId, true);
  }, 'uuid-ta');

  await page.evaluate((agentId) => {
    (window as any).__napStore__.getState().setActiveTerminal(agentId);
  }, 'uuid-ta');

  // Send a real hook-permission-request via socket so the pending registry has an entry.
  // This is what happens in production: CC fires hook → socket → pendingRegistry + model state.
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
          if (obj.type === 'ping') continue; // ignore keepalive
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

  // Wait for modal to appear (pendingApproval set by socket handler)
  await page.waitForFunction(
    () => document.querySelector('[data-testid="permission-modal"]') !== null,
    { timeout: 5000 },
  );

  // Click approve
  await page.click('[data-testid="permission-approve-btn"]');

  // The hook connection should resolve with allow decision
  const result = await hookResult;
  expect(result.decision).toBe('allow');

  // Wait for pendingApproval to be cleared in renderer
  await page.waitForFunction(
    (agentId) => {
      const s = (window as any).__napStore__?.getState();
      const agents = s?.napkins?.[0]?.agents || [];
      const agent = agents.find((a: any) => a.id === agentId);
      return agent?.pendingApproval === null;
    },
    'uuid-ta',
    { timeout: 5000 },
  );

  // Verify model cleared
  const cleared = await app.evaluate(({ }, agentId) => {
    const model = (global as any).__napModel__;
    const agents = model.getAllAgents();
    const agent = agents.find((a: any) => a.id === agentId);
    return agent?.pendingApproval === null;
  }, 'uuid-ta');

  expect(cleared).toBe(true);

  // Modal should be gone
  const modalExists = await page.evaluate(() =>
    document.querySelector('[data-testid="permission-modal"]') !== null,
  );
  expect(modalExists).toBe(false);

  hookConn.destroy();
  await cleanupApp(app, tmpDir);
});

// T-0650-23: dismiss modal (switch away) → pendingApproval stays
test('T-0650-23: switch away → pendingApproval stays', async () => {
  const sockPath = await boot();

  // Set up uuid-ta with pending approval + running
  await app.evaluate(({ }, agentId) => {
    const model = (global as any).__napModel__;
    model.setAgentRunning(agentId, true);
  }, 'uuid-ta');

  await page.evaluate((agentId) => {
    (window as any).__napStore__.getState().setActiveTerminal(agentId);
  }, 'uuid-ta');

  await app.evaluate(({ }, agentId) => {
    const model = (global as any).__napModel__;
    model.setAgentPendingApproval(agentId, {
      tool: 'Bash',
      command: 'npm install',
      timestamp: Date.now(),
      payload: {},
    });
  }, 'uuid-ta');

  // Wait for modal to appear
  await page.waitForFunction(
    () => document.querySelector('[data-testid="permission-modal"]') !== null,
    { timeout: 5000 },
  );

  // Switch to a different terminal (architect)
  await page.evaluate(() => {
    (window as any).__napStore__.getState().setActiveTerminal('uuid-arch');
  });

  // Wait a beat for state to propagate
  await page.waitForTimeout(500);

  // pendingApproval should STILL be set on uuid-ta
  const stillPending = await app.evaluate(({ }, agentId) => {
    const model = (global as any).__napModel__;
    const agents = model.getAllAgents();
    const agent = agents.find((a: any) => a.id === agentId);
    return agent?.pendingApproval !== null;
  }, 'uuid-ta');

  expect(stillPending).toBe(true);

  await cleanupApp(app, tmpDir);
});

// T-0650-27: nap3 ps shows pending agents
test('T-0650-27: nap3 ps shows pending status', async () => {
  const sockPath = await boot();

  // Set pending approval
  await app.evaluate(({ }, agentId) => {
    const model = (global as any).__napModel__;
    model.setAgentRunning(agentId, true);
    model.setAgentPendingApproval(agentId, {
      tool: 'Bash',
      command: 'npm install',
      timestamp: Date.now(),
      payload: {},
    });
  }, 'uuid-ta');

  // Run nap3 ps via socket
  const res = await ndjsonSend(sockPath, { type: 'ps', id: 1 });

  const agents = res.agents as Array<{ name: string; status: string; children: any[] }>;
  const allAgents = flattenTree(agents);
  const ta = allAgents.find(a => a.name === '001-test-arch');

  expect(ta).toBeDefined();
  expect(ta!.status).toBe('pending');

  await cleanupApp(app, tmpDir);
});

function flattenTree(nodes: Array<{ name: string; status: string; children: any[] }>): Array<{ name: string; status: string }> {
  const result: Array<{ name: string; status: string }> = [];
  for (const node of nodes) {
    result.push({ name: node.name, status: node.status });
    if (node.children) {
      result.push(...flattenTree(node.children));
    }
  }
  return result;
}
