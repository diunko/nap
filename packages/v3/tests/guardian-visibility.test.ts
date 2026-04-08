import { describe, it, expect, vi, afterEach } from 'vitest';
import * as net from 'net';
import * as path from 'path';
import * as os from 'os';
import * as realFs from 'fs';
import { createModel } from '../src/main/model';
import { NodeFileSystem } from '../src/main/filesystem';
import { createRequestHandler } from '../src/main/socket-handler';
import { FakePtySpawner } from '../src/main/pty-spawner';
import * as mq from '../src/main/message-queue';
import {
  createGuardianCrossLoadFixture,
  createGuardianBothNepicsFixture,
  createNoGuardianFixture,
  createThreeNepicGuardianFixture,
  F19_NEPIC_DIR,
} from './fixtures';

describe('Guardian visibility across nepics', () => {
  // T-0655-01: Guardian loaded from first nepic when active nepic differs
  it('cross-loads guardian from first nepic when active nepic has none', async () => {
    const fs = createGuardianCrossLoadFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(F19_NEPIC_DIR);

    const architects = model.getArchitects();
    const guardian = architects.find(a => a.role === 'guardian');
    expect(guardian).toBeTruthy();
    expect(guardian!.id).toBe('uuid-guardian');
    expect(guardian!.nepicId).toBe('01-v1');
  });

  // T-0655-02: Guardian NOT duplicated when active nepic IS the first nepic
  it('does not duplicate guardian when active nepic is the first nepic', async () => {
    const fs = createGuardianCrossLoadFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem('nepics/01-v1');

    const guardians = model.getArchitects().filter(a => a.role === 'guardian');
    expect(guardians).toHaveLength(1);
  });

  // T-0655-03: No guardian in first nepic → no-op
  it('no guardian anywhere → no error, no guardian in architects', async () => {
    const fs = createNoGuardianFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(F19_NEPIC_DIR);

    expect(model.findAgentByRole('guardian')).toBeNull();
  });

  // T-0655-04: Guardian in both nepics → use active nepic's
  it('uses active nepic guardian when both nepics have one', async () => {
    const fs = createGuardianBothNepicsFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem('nepics/02-spaces');

    const guardians = model.getArchitects().filter(a => a.role === 'guardian');
    expect(guardians).toHaveLength(1);
    expect(guardians[0].id).toBe('uuid-s-guardian');
  });

  // T-0655-05: Empty nepicList → skip guardian cross-load
  it('single nepic (no siblings) → no crash', async () => {
    const fs = createGuardianCrossLoadFixture();
    const model = createModel(fs);
    // Load from a path that has no sibling nepics
    await model.loadFromFilesystem('nepics/01-v1');

    // Should not throw, guardian loaded normally from its own nepic
    const guardian = model.findAgentByRole('guardian');
    expect(guardian).toBeTruthy();
  });

  // T-0655-06: findAgentByRole('guardian') finds cross-loaded guardian
  it('findAgentByRole finds cross-loaded guardian', async () => {
    const fs = createGuardianCrossLoadFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(F19_NEPIC_DIR);

    const guardian = model.findAgentByRole('guardian');
    expect(guardian).toBeTruthy();
    expect(guardian!.role).toBe('guardian');
  });

  // T-0655-07: Cross-loaded guardian survives filesystem reload
  it('guardian survives reload', async () => {
    const fs = createGuardianCrossLoadFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(F19_NEPIC_DIR);

    expect(model.findAgentByRole('guardian')).toBeTruthy();

    // Reload
    await model.loadFromFilesystem(F19_NEPIC_DIR);
    expect(model.findAgentByRole('guardian')).toBeTruthy();
  });

  // T-0655-08: Cross-loaded guardian preserves ephemeral flags across reload
  it('ephemeral flags survive reload on cross-loaded guardian', async () => {
    const fs = createGuardianCrossLoadFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(F19_NEPIC_DIR);

    const guardian = model.findAgentByRole('guardian')!;
    model.setAgentRunning(guardian.id, true);
    model.setAgentPendingApproval(guardian.id, {
      tool: 'bash',
      args: 'ls',
      agentId: guardian.id,
      hookConnectionId: 'hc-1',
    });

    // Reload
    await model.loadFromFilesystem(F19_NEPIC_DIR);
    const reloaded = model.findAgentByRole('guardian')!;
    expect(reloaded.running).toBe(true);
    expect(reloaded.pendingApproval).toBeTruthy();
  });

  // T-0655-10: Guardian's nepicId reflects its home nepic
  it('cross-loaded guardian nepicId is first nepic, not active', async () => {
    const fs = createGuardianCrossLoadFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(F19_NEPIC_DIR);

    const guardian = model.findAgentByRole('guardian')!;
    expect(guardian.nepicId).toBe('01-v1');
  });

  // T-0655-11: Guardian homePath points to first nepic's directory
  it('cross-loaded guardian homePath points to first nepic', async () => {
    const fs = createGuardianCrossLoadFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(F19_NEPIC_DIR);

    const guardian = model.findAgentByRole('guardian')!;
    expect(guardian.homePath).toContain('01-v1/20-architects/002-guardian');
  });

  // T-0655-13: Cross-loaded guardian's entries populated
  it('cross-loaded guardian has entries', async () => {
    const fs = createGuardianCrossLoadFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(F19_NEPIC_DIR);

    const guardian = model.findAgentByRole('guardian')!;
    expect(guardian.entries.length).toBeGreaterThan(0);
  });

  // T-0655-14: Three nepics — guardian always from first
  it('three nepics — guardian from first regardless of active', async () => {
    const fs = createThreeNepicGuardianFixture();
    const model = createModel(fs);

    await model.loadFromFilesystem('nepics/03-kanban');
    const g1 = model.findAgentByRole('guardian');
    expect(g1).toBeTruthy();
    expect(g1!.id).toBe('uuid-guardian');

    await model.loadFromFilesystem('nepics/02-spaces');
    const g2 = model.findAgentByRole('guardian');
    expect(g2).toBeTruthy();
    expect(g2!.id).toBe('uuid-guardian');
  });

  // T-0655-09: Nepic switch — guardian visible before AND after switch
  it('guardian visible before AND after nepic switch, no duplication', async () => {
    const fs = createGuardianCrossLoadFixture();
    const model = createModel(fs);

    // State 1: on first nepic — guardian loaded locally
    await model.loadFromFilesystem('nepics/01-v1');
    expect(model.findAgentByRole('guardian')).toBeTruthy();
    expect(model.getArchitects().filter(a => a.role === 'guardian')).toHaveLength(1);

    // State 2: switch to second nepic — guardian cross-loaded
    await model.switchNepic('02-spaces');
    expect(model.findAgentByRole('guardian')).toBeTruthy();
    expect(model.getArchitects().filter(a => a.role === 'guardian')).toHaveLength(1);
    expect(model.findAgentByRole('guardian')!.id).toBe('uuid-guardian');

    // State 3: switch back to first nepic — guardian still there, no duplication
    await model.switchNepic('01-v1');
    expect(model.findAgentByRole('guardian')).toBeTruthy();
    expect(model.getArchitects().filter(a => a.role === 'guardian')).toHaveLength(1);
  });

  // T-0655-12: Permission hook + cross-loaded guardian — poke reaches guardian
  it('hook-permission-request pokes cross-loaded guardian', async () => {
    const fs = createGuardianCrossLoadFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(F19_NEPIC_DIR);

    // Guardian is cross-loaded — mark it as running
    const guardian = model.findAgentByRole('guardian')!;
    model.setAgentRunning(guardian.id, true);

    const ptySpawner = new FakePtySpawner();
    const handler = createRequestHandler(model, ptySpawner);
    const enqueueSpy = vi.spyOn(mq, 'enqueue');

    const fakeConn = {
      write: vi.fn(),
      on: vi.fn(),
      destroyed: false,
    } as unknown as net.Socket;

    // Fire hook-permission-request — don't await (it hangs until permission-response)
    // enqueue runs synchronously before the internal await
    handler(
      {
        type: 'hook-permission-request',
        id: 1,
        agentId: 'uuid-s-arch',
        tool: 'Bash',
        command: 'rm -rf node_modules',
        payload: {},
      },
      fakeConn,
    );

    expect(enqueueSpy).toHaveBeenCalledWith(
      'uuid-guardian',
      expect.stringContaining('permission-request from: 001-architect'),
    );
    expect(enqueueSpy).toHaveBeenCalledWith(
      'uuid-guardian',
      expect.stringContaining('tool: Bash'),
    );
    expect(enqueueSpy).toHaveBeenCalledWith(
      'uuid-guardian',
      expect.stringContaining('command: rm -rf node_modules'),
    );

    enqueueSpy.mockRestore();
  });
});

// ── BUG ISOLATION: cross-load with real NodeFileSystem ──
// Small tests pass with MemoryFileSystem, but medium tests fail with NodeFileSystem.
// This test isolates the difference by running the same model code against real disk.

describe('Guardian cross-load — NodeFileSystem (real disk)', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) realFs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeFixture(fixture: Record<string, object | string | null>): string {
    tmpDir = realFs.mkdtempSync(path.join(os.tmpdir(), 'nap-guardian-test-'));
    const nepicsBase = path.join(tmpDir, 'nepics');

    for (const [filePath, content] of Object.entries(fixture)) {
      const fullPath = path.join(nepicsBase, filePath);
      realFs.mkdirSync(path.dirname(fullPath), { recursive: true });
      if (content !== null) {
        if (typeof content === 'string') {
          realFs.writeFileSync(fullPath, content);
        } else {
          realFs.writeFileSync(fullPath, JSON.stringify(content, null, 2));
        }
      }
    }

    return nepicsBase;
  }

  it('cross-loads guardian from first nepic on real filesystem', async () => {
    const nepicsBase = writeFixture({
      '01-v1/30-napkins/0100-explore/.napkin.nap.json': { status: 'doing' },
      '01-v1/20-architects/001-architect/.agent.nap.json': {
        cc_session_uuid: 'uuid-v1-arch',
        role: 'architect',
        name: '001-architect',
        nepic: '01-v1',
        created_at: 1711600000000,
      },
      '01-v1/20-architects/002-guardian/.agent.nap.json': {
        cc_session_uuid: 'uuid-guardian',
        role: 'guardian',
        name: '002-guardian',
        nepic: '01-v1',
        created_at: 1711600100000,
      },
      '01-v1/20-architects/002-guardian/prompt.md': 'You are the guardian.',
      '02-spaces/30-napkins/0100-design/.napkin.nap.json': { status: 'doing' },
      '02-spaces/20-architects/001-architect/.agent.nap.json': {
        cc_session_uuid: 'uuid-s-arch',
        role: 'architect',
        name: '001-architect',
        nepic: '02-spaces',
        created_at: 1711600000000,
      },
    });

    const nodeFs = new NodeFileSystem();
    const model = createModel(nodeFs);
    const activeDir = path.join(nepicsBase, '02-spaces');
    await model.loadFromFilesystem(activeDir);

    // Verify preconditions
    const nepics = model.getNepics();
    expect(nepics.length).toBe(2);
    expect(nepics[0].id).toBe('01-v1');
    expect(model.getActiveNepicId()).toBe('02-spaces');

    // THE BUG: guardian should be cross-loaded but isn't with NodeFileSystem
    const guardian = model.findAgentByRole('guardian');
    expect(guardian).toBeTruthy();
    expect(guardian!.nepicId).toBe('01-v1');
    expect(guardian!.id).toBe('uuid-guardian');
  });
});
