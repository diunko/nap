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

const TRACE = process.env['TRACE'] === '1';

export class GhostWatcher {
  private dirWatches = new Map<string, DirWatch>();
  private onAppear: (filePath: string, content: string) => void;
  private dirQueues = new Map<string, Promise<unknown>>();
  public traceLog: string[] = [];

  constructor(onAppear: (filePath: string, content: string) => void) {
    this.onAppear = onAppear;
  }

  private trace(msg: string): void {
    if (TRACE) console.log(`[ghost-watcher] ${msg}`);
    this.traceLog.push(msg);
  }

  async watch(filePath: string): Promise<void> {
    this.trace(`watch called: ${filePath}`);
    const dirPath = path.dirname(filePath);
    const prev = this.dirQueues.get(dirPath) ?? Promise.resolve();
    const next = prev.then(() => this._doWatch(filePath, dirPath));
    this.dirQueues.set(dirPath, next.catch(() => {}));
    return next;
  }

  private async _doWatch(filePath: string, dirPath: string): Promise<void> {
    const existing = this.dirWatches.get(dirPath);
    if (existing) {
      this.trace(`existing subscription for dir, adding ghost: ${filePath}`);
      existing.ghosts.add(filePath);
      return;
    }

    this.trace(`subscribing to dir: ${dirPath}`);
    const ghosts = new Set<string>([filePath]);
    const subscription = await watcher.subscribe(dirPath, async (err, events) => {
      if (err) {
        this.trace(`watcher error: ${err}`);
        return;
      }
      const dw = this.dirWatches.get(dirPath);
      if (!dw) {
        this.trace(`watcher event but no dirWatch for: ${dirPath}`);
        return;
      }

      this.trace(`watcher events: ${JSON.stringify(events.map(e => ({ type: e.type, path: e.path })))}`);
      this.trace(`current ghosts: ${JSON.stringify([...dw.ghosts])}`);

      for (const event of events) {
        if (event.type !== 'create' && event.type !== 'update') continue;
        const eventBasename = path.basename(event.path);

        for (const ghostPath of dw.ghosts) {
          const ghostBasename = path.basename(ghostPath);
          this.trace(`comparing: event=${eventBasename} ghost=${ghostBasename}`);
          if (ghostBasename === eventBasename) {
            try {
              const content = await fs.readFile(ghostPath, 'utf-8');
              this.trace(`readFile success for ${ghostPath}, firing onAppear`);
              dw.ghosts.delete(ghostPath);
              this.onAppear(ghostPath, content);
              if (dw.ghosts.size === 0) {
                await subscription.unsubscribe();
                this.dirWatches.delete(dirPath);
              }
            } catch (e) {
              this.trace(`readFile failed for ${ghostPath}: ${e}`);
            }
          }
        }
      }
    });

    this.trace(`subscription ready for dir: ${dirPath}`);
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
