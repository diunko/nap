// ── Content file watcher — watches a single file path for external changes ──
//
// Uses @parcel/watcher on the parent directory, filters by filename.
// Handles atomic writes (temp+rename), git checkout, delete+recreate.

import * as path from 'path';
import * as fs from 'fs/promises';
import watcher from '@parcel/watcher';

export interface ContentWatcherOptions {
  /** Called with (filePath, newContent) when the watched file changes externally. */
  onChange: (filePath: string, content: string) => void;
  /** Return true if this path has a pending write (echo suppression). */
  isPendingWrite: (filePath: string) => boolean;
  /** Debounce delay in ms (default 200). */
  debounceMs?: number;
}

export class ContentWatcher {
  private subscription: watcher.AsyncSubscription | null = null;
  private watchedPath: string | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private lastContent: string | null = null;
  private onChange: ContentWatcherOptions['onChange'];
  private isPendingWrite: ContentWatcherOptions['isPendingWrite'];
  private debounceMs: number;

  constructor(opts: ContentWatcherOptions) {
    this.onChange = opts.onChange;
    this.isPendingWrite = opts.isPendingWrite;
    this.debounceMs = opts.debounceMs ?? 200;
  }

  /** Start watching a file. Stops any previous watch. */
  async watch(filePath: string | null): Promise<void> {
    await this.stop();
    this.watchedPath = filePath;
    this.lastContent = null;

    if (!filePath) return;

    // Snapshot current content for dedup
    try {
      this.lastContent = await fs.readFile(filePath, 'utf-8');
    } catch {
      // File may not exist yet
    }

    const dir = path.dirname(filePath);
    const basename = path.basename(filePath);

    this.subscription = await watcher.subscribe(dir, (err, events) => {
      if (err) return;

      const relevant = events.some(
        (e) => (e.type === 'update' || e.type === 'create') && path.basename(e.path) === basename,
      );
      if (!relevant) return;
      if (this.isPendingWrite(filePath)) return;

      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(async () => {
        // Re-check suppression — event may have arrived before pending was set
        if (this.isPendingWrite(filePath)) return;
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          // Dedup: only fire if content actually changed
          if (content === this.lastContent) return;
          this.lastContent = content;
          this.onChange(filePath, content);
        } catch {
          // File may have been deleted
        }
      }, this.debounceMs);
    });
  }

  /** Stop watching. */
  async stop(): Promise<void> {
    clearTimeout(this.debounceTimer);
    if (this.subscription) {
      await this.subscription.unsubscribe();
      this.subscription = null;
    }
    this.watchedPath = null;
    this.lastContent = null;
  }

  /** The currently watched path. */
  getWatchedPath(): string | null {
    return this.watchedPath;
  }
}
