import { describe, it, expect, vi } from 'vitest';
import { createModel } from '../src/main/model';
import {
  createMinimalFixture,
  createRichFixture,
  createEmptyFixture,
  createExitedAgentFixture,
  createNoArchitectsFixture,
  NEPIC_DIR,
} from './fixtures';

describe('NapModel', () => {
  // T-0100-01
  it('loads minimal project correctly', async () => {
    const fs = createMinimalFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);

    const napkins = model.getNapkins();
    expect(napkins).toHaveLength(1);
    expect(napkins[0].slug).toBe('0100-explore');
    expect(napkins[0].status).toBe('doing');
    expect(napkins[0].agents).toHaveLength(1);
    expect(napkins[0].agents[0].name).toBe('001-test-arch');
    expect(napkins[0].agents[0].role).toBe('test-arch');
    expect(napkins[0].agents[0].id).toBe('uuid-ta');

    const architects = model.getArchitects();
    expect(architects).toHaveLength(1);
    expect(architects[0].name).toBe('001-architect');
    expect(architects[0].id).toBe('uuid-arch');
  });

  // T-0100-02
  it('loads rich project — multiple napkins, mixed statuses, multiple agents', async () => {
    const fs = createRichFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);

    const napkins = model.getNapkins();
    expect(napkins).toHaveLength(3);

    // 0100-explore: done, 2 agents
    expect(napkins[0].slug).toBe('0100-explore');
    expect(napkins[0].status).toBe('done');
    expect(napkins[0].agents).toHaveLength(2);
    // Sorted by createdAt
    expect(napkins[0].agents[0].name).toBe('001-test-arch');
    expect(napkins[0].agents[1].name).toBe('002-fs-eng');

    // 0200-build: doing, 1 agent
    expect(napkins[1].slug).toBe('0200-build');
    expect(napkins[1].status).toBe('doing');
    expect(napkins[1].agents).toHaveLength(1);

    // 0300-polish: backlog, 0 agents
    expect(napkins[2].slug).toBe('0300-polish');
    expect(napkins[2].status).toBe('backlog');
    expect(napkins[2].agents).toHaveLength(0);
  });

  // T-0100-03
  it('handles missing marker files — dirs exist, no JSON', async () => {
    const fs = createEmptyFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);

    const napkins = model.getNapkins();
    expect(napkins).toHaveLength(1);
    expect(napkins[0].slug).toBe('0100-explore');
    expect(napkins[0].status).toBe('backlog'); // default

    // Agent dir exists but no .agent.nap.json → agent with defaults
    expect(napkins[0].agents).toHaveLength(1);
    expect(napkins[0].agents[0].name).toBe('001-test-arch');
    expect(napkins[0].agents[0].role).toBe('');
    expect(napkins[0].agents[0].id).toBe('');

    // 20-architects/ empty → no architects
    expect(model.getArchitects()).toEqual([]);
  });

  // T-0100-04
  it('handles exited agent', async () => {
    const fs = createExitedAgentFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);

    const napkins = model.getNapkins();
    expect(napkins).toHaveLength(1);
    expect(napkins[0].agents).toHaveLength(1);
    expect(napkins[0].agents[0].exited).toBe(true);
    expect(napkins[0].agents[0].id).toBe('uuid-exited');
  });

  // T-0100-05
  it('model with no architects', async () => {
    const fs = createNoArchitectsFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);

    expect(model.getArchitects()).toEqual([]);
    expect(model.getNapkins()).toHaveLength(1);
  });

  // T-0100-06
  it('emits change notification on load', async () => {
    const fs = createMinimalFixture();
    const model = createModel(fs);
    const spy = vi.fn();

    model.onChange(spy);
    await model.loadFromFilesystem(NEPIC_DIR);

    expect(spy).toHaveBeenCalled();
  });

  // T-0100-07
  it('onChange unsubscribe works', async () => {
    const fs = createMinimalFixture();
    const model = createModel(fs);
    const spy = vi.fn();

    const unsub = model.onChange(spy);
    unsub();
    await model.loadFromFilesystem(NEPIC_DIR);

    expect(spy).not.toHaveBeenCalled();
  });

  // T-0100-08
  it('napkin slug derived from directory name', async () => {
    const fs = createMinimalFixture();
    const model = createModel(fs);
    await model.loadFromFilesystem(NEPIC_DIR);

    expect(model.getNapkins()[0].slug).toBe('0100-explore');
  });
});
