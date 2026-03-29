import { describe, it, expect } from 'vitest';
import { createModel } from '../src/main/model';
import { FakeBridge, wireModelToBridge } from '../src/main/bridge';
import type { AppSnapshot } from '../src/shared/bridge-types';
import {
  createMinimalFixture,
  createRichFixture,
  createEdgeCaseFixture,
  NEPIC_DIR,
} from './fixtures';

describe('Journey — full round-trip in vitest', () => {
  // T-0100-20
  it('model loads, bridge delivers, renderer store populated', async () => {
    const fs = createMinimalFixture();
    const model = createModel(fs);
    const bridge = new FakeBridge();
    wireModelToBridge(model, bridge, 'nepic-01');

    // Simulate renderer store
    let storeState: AppSnapshot | null = null;
    bridge.onSnapshot((snapshot) => {
      storeState = snapshot;
    });

    await model.loadFromFilesystem(NEPIC_DIR);

    expect(storeState).not.toBeNull();
    expect(storeState!.napkins[0].slug).toBe('0100-explore');
    expect(storeState!.napkins[0].agents[0].role).toBe('test-arch');
    expect(storeState!.architects[0].name).toBe('001-architect');
  });

  // T-0100-21
  it('rich project state arrives at renderer correctly', async () => {
    const fs = createRichFixture();
    const model = createModel(fs);
    const bridge = new FakeBridge();
    wireModelToBridge(model, bridge, 'nepic-01');

    let storeState: AppSnapshot | null = null;
    bridge.onSnapshot((snapshot) => {
      storeState = snapshot;
    });

    await model.loadFromFilesystem(NEPIC_DIR);

    expect(storeState).not.toBeNull();
    expect(storeState!.napkins).toHaveLength(3);

    // Agent counts
    expect(storeState!.napkins[0].agents).toHaveLength(2);
    expect(storeState!.napkins[1].agents).toHaveLength(1);
    expect(storeState!.napkins[2].agents).toHaveLength(0);

    // Statuses
    expect(storeState!.napkins[0].status).toBe('done');
    expect(storeState!.napkins[1].status).toBe('doing');
    expect(storeState!.napkins[2].status).toBe('backlog');

    // Architect
    expect(storeState!.architects).toHaveLength(1);
  });

  // T-0100-22
  it('edge case project (missing markers + exited) arrives at renderer', async () => {
    const fs = createEdgeCaseFixture();
    const model = createModel(fs);
    const bridge = new FakeBridge();
    wireModelToBridge(model, bridge, 'nepic-01');

    let storeState: AppSnapshot | null = null;
    bridge.onSnapshot((snapshot) => {
      storeState = snapshot;
    });

    await model.loadFromFilesystem(NEPIC_DIR);

    expect(storeState).not.toBeNull();
    expect(storeState!.napkins).toHaveLength(2);

    // Missing marker → default status
    const explore = storeState!.napkins.find((n) => n.slug === '0100-explore');
    expect(explore).toBeDefined();
    expect(explore!.status).toBe('backlog');

    // Exited agent preserved
    const build = storeState!.napkins.find((n) => n.slug === '0200-build');
    expect(build).toBeDefined();
    expect(build!.agents[0].exited).toBe(true);
  });
});
