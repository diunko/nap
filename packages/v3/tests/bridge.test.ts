import { describe, it, expect, vi } from 'vitest';
import { createModel } from '../src/main/model';
import { FakeBridge, wireModelToBridge } from '../src/main/bridge';
import { createMinimalFixture, createRichFixture, NEPIC_DIR } from './fixtures';

describe('Bridge', () => {
  // T-0100-10
  it('delivers snapshot on model change', async () => {
    const fs = createMinimalFixture();
    const model = createModel(fs);
    const bridge = new FakeBridge();
    wireModelToBridge(model, bridge);

    const spy = vi.fn();
    bridge.onSnapshot(spy);

    await model.loadFromFilesystem(NEPIC_DIR);

    expect(spy).toHaveBeenCalledOnce();
    const snapshot = spy.mock.calls[0][0];
    expect(snapshot.napkins).toEqual(model.getNapkins());
    expect(snapshot.architects).toEqual(model.getArchitects());
    expect(snapshot.activeNepicId).toBe('nepic');
  });

  // T-0100-11
  it('snapshot contains full state, not delta', async () => {
    const fs = createRichFixture();
    const model = createModel(fs);
    const bridge = new FakeBridge();
    wireModelToBridge(model, bridge);

    const spy = vi.fn();
    bridge.onSnapshot(spy);

    await model.loadFromFilesystem(NEPIC_DIR);

    const snapshot = spy.mock.calls[0][0];
    expect(snapshot.napkins).toHaveLength(3);
    expect(snapshot.architects).toHaveLength(1);
  });

  // T-0100-12
  it('round-trip — intent from renderer reaches main', () => {
    const bridge = new FakeBridge();
    const spy = vi.fn();

    bridge.onIntent(spy);
    bridge.sendIntent({ type: 'setActiveTerminal', id: 'uuid-1' });

    expect(spy).toHaveBeenCalledWith({ type: 'setActiveTerminal', id: 'uuid-1' });
  });

  // T-0100-13
  it('delivers snapshot to multiple listeners', async () => {
    const fs = createMinimalFixture();
    const model = createModel(fs);
    const bridge = new FakeBridge();
    wireModelToBridge(model, bridge);

    const spy1 = vi.fn();
    const spy2 = vi.fn();
    bridge.onSnapshot(spy1);
    bridge.onSnapshot(spy2);

    await model.loadFromFilesystem(NEPIC_DIR);

    expect(spy1).toHaveBeenCalledOnce();
    expect(spy2).toHaveBeenCalledOnce();
    expect(spy1.mock.calls[0][0]).toEqual(spy2.mock.calls[0][0]);
  });
});
