// ── PtySpawner interface — injectable for testing ──

export interface PtySpawner {
  spawn(opts: { id: string; command: string; cwd: string }): void;
  kill(id: string): void;
  killAll(): void;
  isRunning(id: string): boolean;
  runningCount(): number;
  onExit(id: string, callback: (exitCode: number) => void | Promise<void>): void;
  clearExitHandlers(): void;
}

// ── FakePtySpawner — records calls, for small tests ──

export class FakePtySpawner implements PtySpawner {
  spawned: { id: string; command: string; cwd: string }[] = [];
  private running = new Set<string>();
  private exitCallbacks = new Map<string, (exitCode: number) => void | Promise<void>>();

  spawn(opts: { id: string; command: string; cwd: string }): void {
    this.spawned.push(opts);
    this.running.add(opts.id);
  }

  kill(id: string): void {
    if (this.running.has(id)) {
      this.running.delete(id);
      const cb = this.exitCallbacks.get(id);
      if (cb) {
        cb(0);
        this.exitCallbacks.delete(id);
      }
    }
  }

  killAll(): void {
    for (const id of [...this.running]) {
      this.kill(id);
    }
  }

  isRunning(id: string): boolean {
    return this.running.has(id);
  }

  runningCount(): number {
    return this.running.size;
  }

  onExit(id: string, callback: (exitCode: number) => void | Promise<void>): void {
    this.exitCallbacks.set(id, callback);
  }

  clearExitHandlers(): void {
    this.exitCallbacks.clear();
  }

  /** Test-only: simulate a pty exit. Awaitable so disk writes complete. */
  async simulateExit(id: string, exitCode: number): Promise<void> {
    this.running.delete(id);
    const cb = this.exitCallbacks.get(id);
    if (cb) {
      const result = cb(exitCode);
      if (result && typeof (result as Promise<void>).then === 'function') {
        await result;
      }
      this.exitCallbacks.delete(id);
    }
  }
}
