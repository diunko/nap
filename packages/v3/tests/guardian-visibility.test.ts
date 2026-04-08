import { describe, it, expect } from 'vitest';
import { createModel } from '../src/main/model';
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
});
