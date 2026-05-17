/**
 * BashShell — forked from @wterm/just-bash (324 lines).
 *
 * Changes from original:
 *   - Accepts `fs?: IFileSystem` and `customCommands?: CustomCommand[]` in options
 *   - Passes both through to `new Bash({ fs, customCommands, ... })`
 *   - This is the fix for the critical gap: original BashShell.attach()
 *     hardcodes `new Bash({files, env, network})` without `fs` passthrough
 */
import type { Bash, NetworkConfig, IFileSystem, CustomCommand } from 'just-bash';

export interface ShellOptions {
  files?: Record<string, string>;
  env?: Record<string, string>;
  cwd?: string;
  greeting?: string | string[];
  prompt?: (cwd: string) => string;
  network?: NetworkConfig;
  fs?: IFileSystem;
  customCommands?: CustomCommand[];
}

function defaultPrompt(cwd: string): string {
  const display = cwd.replace(/^\/home\/user/, '~') || '/';
  return `\x1b[1;32muser@wterm\x1b[0m:\x1b[1;34m${display}\x1b[0m$ `;
}

export class BashShell {
  private _bash: Bash | null = null;
  private _write: ((data: string) => void) | null = null;
  private _cwd: string;
  private _line = '';
  private _cursor = 0;
  private _buffer = '';
  private _heredocDelim: string | null = null;
  private _history: string[] = [];
  private _historyPos = -1;
  private _busy = false;

  private _files: Record<string, string>;
  private _env: Record<string, string>;
  private _greeting: string[];
  private _prompt: (cwd: string) => string;
  private _network?: NetworkConfig;
  private _fs?: IFileSystem;
  private _customCommands?: CustomCommand[];

  constructor(options: ShellOptions = {}) {
    this._files = options.files ?? {};
    this._env = options.env ?? { SHELL: '/bin/bash', TERM: 'xterm-256color' };
    this._cwd = options.cwd ?? '/home/user';
    this._prompt = options.prompt ?? defaultPrompt;
    this._network = options.network;
    this._fs = options.fs;
    this._customCommands = options.customCommands;

    if (options.greeting === undefined) {
      this._greeting = [];
    } else if (typeof options.greeting === 'string') {
      this._greeting = [options.greeting];
    } else {
      this._greeting = options.greeting;
    }
  }

  get cwd(): string {
    return this._cwd;
  }

  get bash(): Bash | null {
    return this._bash;
  }

  async attach(write: (data: string) => void): Promise<void> {
    this._write = write;

    const { Bash } = await import('just-bash');
    this._bash = new Bash({
      files: this._files,
      env: this._env,
      network: this._network,
      fs: this._fs,
      customCommands: this._customCommands,
    });

    if (this._greeting.length > 0) {
      write(this._greeting.join('\r\n') + '\r\n');
    }
    write(this._prompt(this._cwd));
  }

  async handleInput(data: string): Promise<void> {
    if (!this._write || this._busy) return;
    const write = this._write;

    if (data === '\t') {
      await this._tabComplete();
      return;
    }

    if (data === '\r') {
      const cur = this._line;
      this._line = '';
      this._cursor = 0;
      write('\r\n');

      // Heredoc: currently buffering body lines
      if (this._heredocDelim) {
        this._buffer += cur + '\n';
        if (cur.trim() === this._heredocDelim) {
          this._heredocDelim = null;
          // buffer has the complete command — fall through, don't append cur again
          const cmd = this._buffer;
          this._buffer = '';
          if (cmd.trim() && this._bash) {
            this._history.push(cmd.trimEnd());
            this._historyPos = -1;
            this._busy = true;
            try {
              const wrapped = `cd ${JSON.stringify(this._cwd)} && ${cmd}`;
              console.log(`[shell] exec: ${wrapped}`);
              const result = await this._bash.exec(wrapped);
              console.log(`[shell] stdout=${JSON.stringify(result.stdout?.slice(0, 100))} stderr=${JSON.stringify(result.stderr?.slice(0, 100))}`);
              if (result.stdout) {
                write(result.stdout.replace(/\n/g, '\r\n'));
                if (!result.stdout.endsWith('\n')) write('\r\n');
              }
              if (result.stderr) {
                write(`\x1b[31m${result.stderr.replace(/\n/g, '\r\n')}\x1b[0m`);
                if (!result.stderr.endsWith('\n')) write('\r\n');
              }
              const envPwd = result.env?.['PWD'];
              if (envPwd) this._cwd = envPwd;
            } catch (err) {
              const msg = err instanceof Error ? err.message : 'Unknown error';
              write(`\x1b[31m${msg}\x1b[0m\r\n`);
            } finally {
              this._busy = false;
            }
          }
          write(this._prompt(this._cwd));
          return;
        } else {
          write('> ');
          return;
        }
      }

      if (cur.endsWith('\\')) {
        this._buffer += cur + '\n';
        write('> ');
        return;
      }

      // Detect heredoc start: <<WORD or <<'WORD' or <<"WORD" or <<-WORD
      const accumulated = this._buffer + cur;
      const heredocMatch = accumulated.match(/<<-?\s*['"]?(\w+)['"]?\s*$/);
      if (heredocMatch) {
        this._heredocDelim = heredocMatch[1];
        this._buffer = accumulated + '\n';
        write('> ');
        return;
      }

      const cmd = this._buffer + cur;
      this._buffer = '';

      if (cmd.trim() && this._bash) {
        this._history.push(cmd);
        this._historyPos = -1;
        this._busy = true;

        try {
          const wrapped = `cd ${JSON.stringify(this._cwd)} && ${cmd}`;
          console.log(`[shell] exec: ${wrapped}`);
          const result = await this._bash.exec(wrapped);
          console.log(`[shell] stdout=${JSON.stringify(result.stdout?.slice(0, 100))} stderr=${JSON.stringify(result.stderr?.slice(0, 100))}`);
          if (result.stdout) {
            write(result.stdout.replace(/\n/g, '\r\n'));
            if (!result.stdout.endsWith('\n')) write('\r\n');
          }
          if (result.stderr) {
            write(`\x1b[31m${result.stderr.replace(/\n/g, '\r\n')}\x1b[0m`);
            if (!result.stderr.endsWith('\n')) write('\r\n');
          }
          const envPwd = result.env?.['PWD'];
          const getCwd = this._bash.getCwd();
          console.log(`[shell] cwd tracking: env.PWD=${envPwd} getCwd=${getCwd} was=${this._cwd}`);
          if (envPwd) this._cwd = envPwd;
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          write(`\x1b[31m${msg}\x1b[0m\r\n`);
        } finally {
          this._busy = false;
        }
      }

      write(this._prompt(this._cwd));
    } else if (data === '\x7f' || data === '\b') {
      if (this._cursor > 0) {
        const tail = this._line.slice(this._cursor);
        this._line = this._line.slice(0, this._cursor - 1) + tail;
        this._cursor--;
        write('\b' + tail + '\x1b[K');
        if (tail.length > 0) write(`\x1b[${tail.length}D`);
      }
    } else if (data === '\x1b[A') {
      if (!this._history.length) return;
      if (this._historyPos < 0) this._historyPos = this._history.length;
      if (this._historyPos > 0) {
        this._historyPos--;
        const entry = this._history[this._historyPos];
        write(`\r${this._prompt(this._cwd)}\x1b[K${entry}`);
        this._line = entry;
        this._cursor = entry.length;
      }
    } else if (data === '\x1b[B') {
      if (this._historyPos < 0) return;
      this._historyPos++;
      if (this._historyPos >= this._history.length) {
        this._historyPos = -1;
        write(`\r${this._prompt(this._cwd)}\x1b[K`);
        this._line = '';
        this._cursor = 0;
      } else {
        const entry = this._history[this._historyPos];
        write(`\r${this._prompt(this._cwd)}\x1b[K${entry}`);
        this._line = entry;
        this._cursor = entry.length;
      }
    } else if (data === '\x1b[D') {
      if (this._cursor > 0) {
        this._cursor--;
        write('\x1b[D');
      }
    } else if (data === '\x1b[C') {
      if (this._cursor < this._line.length) {
        this._cursor++;
        write('\x1b[C');
      }
    } else if (data === '\x15') {
      if (this._line.length > 0) {
        if (this._cursor > 0) write(`\x1b[${this._cursor}D`);
        write('\x1b[K');
        this._line = '';
        this._cursor = 0;
      }
    } else if (data === '\x01') {
      if (this._cursor > 0) {
        write(`\x1b[${this._cursor}D`);
        this._cursor = 0;
      }
    } else if (data === '\x05') {
      if (this._cursor < this._line.length) {
        write(`\x1b[${this._line.length - this._cursor}C`);
        this._cursor = this._line.length;
      }
    } else if (data === '\x03') {
      this._line = '';
      this._cursor = 0;
      this._buffer = '';
      write('^C\r\n');
      write(this._prompt(this._cwd));
    } else if (data === '\x0c') {
      write('\x1b[2J\x1b[H');
      write(this._prompt(this._cwd));
      write(this._line);
      if (this._cursor < this._line.length) {
        write(`\x1b[${this._line.length - this._cursor}D`);
      }
    } else if (data.length === 1 && data >= ' ') {
      const tail = this._line.slice(this._cursor);
      this._line = this._line.slice(0, this._cursor) + data + tail;
      this._cursor++;
      if (tail.length === 0) {
        write(data);
      } else {
        write(data + tail + '\x1b[K');
        write(`\x1b[${tail.length}D`);
      }
    } else if (data.length > 1) {
      for (const ch of data) {
        await this.handleInput(ch);
      }
    }
  }

  private async _tabComplete(): Promise<void> {
    const bash = this._bash;
    const write = this._write;
    if (!bash || !write) return;

    const line = this._line;
    const parts = line.split(/\s+/);
    const word = parts[parts.length - 1] ?? '';
    const isFirst = parts.length <= 1;

    let dir: string;
    let prefix: string;
    if (word.includes('/')) {
      const lastSlash = word.lastIndexOf('/');
      const rawDir = word.slice(0, lastSlash + 1);
      prefix = word.slice(lastSlash + 1);
      if (rawDir.startsWith('/')) {
        dir = rawDir;
      } else if (rawDir.startsWith('~/')) {
        dir = `/home/user/${rawDir.slice(2)}`;
      } else {
        dir = `${this._cwd}/${rawDir}`;
      }
    } else {
      dir = this._cwd;
      prefix = word;
    }

    let candidates: string[] = [];
    try {
      const result = await bash.exec(`ls -1a ${JSON.stringify(dir)}`, {
        cwd: this._cwd,
      });
      if (result.exitCode === 0 && result.stdout) {
        candidates = result.stdout
          .split('\n')
          .filter((f) => f && f !== '.' && f !== '..' && f.startsWith(prefix));
      }
    } catch {
      return;
    }

    if (isFirst && !word.includes('/')) {
      try {
        const cmdResult = await bash.exec(
          `compgen -c ${JSON.stringify(prefix)} 2>/dev/null || true`,
          { cwd: this._cwd },
        );
        if (cmdResult.exitCode === 0 && cmdResult.stdout) {
          const cmds = cmdResult.stdout.split('\n').filter(Boolean);
          for (const c of cmds) {
            if (!candidates.includes(c)) candidates.push(c);
          }
        }
      } catch {
        /* compgen may not be available */
      }
    }

    if (candidates.length === 0) return;

    if (candidates.length === 1) {
      const completion = candidates[0].slice(prefix.length);
      if (completion) {
        this._line += completion;
        this._cursor += completion.length;
        write(completion);
      }
      try {
        const full = word + completion;
        const testPath = full.startsWith('/') ? full : `${this._cwd}/${full}`;
        const stat = await bash.exec(
          `test -d ${JSON.stringify(testPath)} && echo DIR`,
          { cwd: this._cwd },
        );
        if (stat.stdout?.trim() === 'DIR' && !this._line.endsWith('/')) {
          this._line += '/';
          this._cursor++;
          write('/');
        }
      } catch {
        /* ignore */
      }
    } else {
      let common = candidates[0];
      for (let i = 1; i < candidates.length; i++) {
        while (!candidates[i].startsWith(common)) {
          common = common.slice(0, -1);
        }
      }
      const partialCompletion = common.slice(prefix.length);
      if (partialCompletion) {
        this._line += partialCompletion;
        this._cursor += partialCompletion.length;
        write(partialCompletion);
      } else {
        write('\r\n');
        write(candidates.join('  ').replace(/\n/g, '\r\n'));
        write('\r\n');
        write(this._prompt(this._cwd));
        write(this._line);
      }
    }
  }
}
