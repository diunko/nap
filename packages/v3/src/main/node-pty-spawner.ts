import * as pty from 'node-pty';
import type { PtySpawner } from './pty-spawner';

/**
 * Real PtySpawner wrapping node-pty.
 * In test mode (NAP_TEST=1), replaces claude commands with `cat`.
 */
export class NodePtySpawner implements PtySpawner {
  private processes = new Map<string, pty.IPty>();
  private exitCallbacks = new Map<string, (exitCode: number) => void | Promise<void>>();
  private outputBuffers = new Map<string, string[]>();
  private detectionBuffers = new Map<string, string>(); // ALL output, survives markReady
  private readyTerminals = new Set<string>();
  private dataHandler: ((id: string, data: string) => void) | null = null;
  private exitNotifier: ((id: string, exitCode: number) => void) | null = null;
  private testMode: boolean;

  constructor(testMode = false) {
    this.testMode = testMode;
  }

  /** Set global data handler — called when a ready terminal emits data */
  setDataHandler(handler: (id: string, data: string) => void): void {
    this.dataHandler = handler;
  }

  /** Set global exit notifier — called when any pty exits (for renderer notification) */
  setExitNotifier(handler: (id: string, exitCode: number) => void): void {
    this.exitNotifier = handler;
  }

  spawn(opts: { id: string; command: string; cwd: string }): void {
    const userShell = process.env['SHELL'] || '/bin/zsh';
    const command = this.testMode ? 'cat' : opts.command;
    const args = ['-c', command];
    const finalCwd = opts.cwd || process.env['NAP_CWD'] || process.cwd();

    const proc = pty.spawn(userShell, args, {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: finalCwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        NAP_SESSION_ID: opts.id,
      } as Record<string, string>,
    });

    this.processes.set(opts.id, proc);
    this.outputBuffers.set(opts.id, []);
    this.detectionBuffers.set(opts.id, '');

    const id = opts.id;

    proc.onData((data: string) => {
      // Always capture in detection buffer (survives markReady flush)
      const det = this.detectionBuffers.get(id);
      if (det !== undefined) {
        // Keep last 4KB only — enough for error messages
        const updated = det + data;
        this.detectionBuffers.set(id, updated.length > 4096 ? updated.slice(-4096) : updated);
      }

      if (this.readyTerminals.has(id)) {
        this.dataHandler?.(id, data);
      } else {
        const buffer = this.outputBuffers.get(id);
        if (buffer) buffer.push(data);
      }
    });

    proc.onExit(({ exitCode }: { exitCode: number }) => {
      this.processes.delete(id);
      this.outputBuffers.delete(id);
      this.readyTerminals.delete(id);

      // Coordinator's exit callback (model update) — detection buffer still available
      const cb = this.exitCallbacks.get(id);
      if (cb) {
        cb(exitCode);
        this.exitCallbacks.delete(id);
      }

      // Clean up detection buffer after exit handler has run
      this.detectionBuffers.delete(id);

      // Renderer notification
      this.exitNotifier?.(id, exitCode);
    });
  }

  kill(id: string): void {
    const proc = this.processes.get(id);
    if (proc) {
      proc.kill();
    }
  }

  killAll(): void {
    for (const proc of this.processes.values()) {
      proc.kill();
    }
    this.processes.clear();
    this.outputBuffers.clear();
    this.readyTerminals.clear();
  }

  isRunning(id: string): boolean {
    return this.processes.has(id);
  }

  runningCount(): number {
    return this.processes.size;
  }

  onExit(id: string, callback: (exitCode: number) => void | Promise<void>): void {
    this.exitCallbacks.set(id, callback);
  }

  clearExitHandlers(): void {
    this.exitCallbacks.clear();
  }

  // ── Extended methods for real pty management ──

  /** Get the output buffer for resume failure detection */
  getOutputBuffer(id: string): string {
    return this.detectionBuffers.get(id) ?? '';
  }

  /** Signal that a terminal is ready to receive data — flushes buffer */
  markReady(id: string): void {
    this.readyTerminals.add(id);
    const buffer = this.outputBuffers.get(id);
    if (buffer) {
      for (const chunk of buffer) {
        this.dataHandler?.(id, chunk);
      }
    }
    this.outputBuffers.delete(id);
  }

  /** Write data to a pty's stdin */
  write(id: string, data: string): void {
    this.processes.get(id)?.write(data);
  }

  /** Resize a pty */
  resize(id: string, cols: number, rows: number): void {
    this.processes.get(id)?.resize(cols, rows);
  }
}
