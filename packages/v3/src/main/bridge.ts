import { EventEmitter } from 'events';
import type { AppSnapshot, AppIntent } from '../shared/bridge-types';
import type { NapModel } from './model';

// ── Bridge interface ──

export interface Bridge {
  pushSnapshot(snapshot: AppSnapshot): void;
  onSnapshot(listener: (snapshot: AppSnapshot) => void): () => void;
  sendIntent(intent: AppIntent): void;
  onIntent(listener: (intent: AppIntent) => void): () => void;
}

// ── FakeBridge — two EventEmitters wired together, for tests ──

export class FakeBridge implements Bridge {
  private mainEmitter = new EventEmitter();
  private rendererEmitter = new EventEmitter();

  pushSnapshot(snapshot: AppSnapshot): void {
    this.rendererEmitter.emit('snapshot', snapshot);
  }

  onSnapshot(listener: (snapshot: AppSnapshot) => void): () => void {
    this.rendererEmitter.on('snapshot', listener);
    return () => { this.rendererEmitter.off('snapshot', listener); };
  }

  sendIntent(intent: AppIntent): void {
    this.mainEmitter.emit('intent', intent);
  }

  onIntent(listener: (intent: AppIntent) => void): () => void {
    this.mainEmitter.on('intent', listener);
    return () => { this.mainEmitter.off('intent', listener); };
  }
}

// ── Wire model to bridge — pushes snapshot on every model change ──

export function wireModelToBridge(model: NapModel, bridge: Bridge): () => void {
  function push(): void {
    bridge.pushSnapshot({
      napkins: model.getNapkins(),
      architects: model.getArchitects(),
      activeNepicId: model.getActiveNepicId(),
      nepics: model.getNepics(),
      watcherEvents: model.getWatcherEvents(),
    });
  }

  return model.onChange(push);
}
