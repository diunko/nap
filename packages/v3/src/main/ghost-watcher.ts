// ── Ghost file watcher — watches parent directories for missing files to reappear ──
//
// Groups watches by parent directory. Multiple ghost tabs in the same dir share one watcher.
// When a ghost file reappears, fires onAppear callback and cleans up.

import * as path from 'path';
import * as fs from 'fs/promises';
import watcher from '@parcel/watcher';

interface DirWatch {
  subscription: watcher.AsyncSubscription;
  ghosts: Set<string>; // full file paths being watched
}

export class GhostWatcher {
  private dirWatches = new Map<string, DirWatch>();
  private onAppear: (filePath: string, content: string) => void;

  constructor(onAppear: (filePath: string, content: string) => void) {
    this.onAppear = onAppear;
  }

  async watch(filePath: string): Promise<void> {
    const dirPath = path.dirname(filePath);

    const existing = this.dirWatches.get(dirPath);
    if (existing) {
      existing.ghosts.add(filePath);
      return;
    }

    const ghosts = new Set<string>([filePath]);
    const subscription = await watcher.subscribe(dirPath, async (err, events) => {
      if (err) return;
      const dw = this.dirWatches.get(dirPath);
      if (!dw) return;

      for (const event of events) {
        if (event.type !== 'create' && event.type !== 'update') continue;
        const eventBasename = path.basename(event.path);

        for (const ghostPath of dw.ghosts) {
          if (path.basename(ghostPath) === eventBasename) {
            try {
              const content = await fs.readFile(ghostPath, 'utf-8');
              dw.ghosts.delete(ghostPath);
              this.onAppear(ghostPath, content);
              if (dw.ghosts.size === 0) {
                await subscription.unsubscribe();
                this.dirWatches.delete(dirPath);
              }
            } catch {
              // File still not readable — ignore
            }
          }
        }
      }
    });

    this.dirWatches.set(dirPath, { subscription, ghosts });
  }

  async unwatch(filePath: string): Promise<void> {
    const dirPath = path.dirname(filePath);
    const dw = this.dirWatches.get(dirPath);
    if (!dw) return;

    dw.ghosts.delete(filePath);
    if (dw.ghosts.size === 0) {
      await dw.subscription.unsubscribe();
      this.dirWatches.delete(dirPath);
    }
  }

  async stopAll(): Promise<void> {
    for (const [, dw] of this.dirWatches) {
      await dw.subscription.unsubscribe();
    }
    this.dirWatches.clear();
  }
}
