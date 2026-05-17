/**
 * `git` custom command for just-bash via defineCommand.
 *
 * Wraps isomorphic-git for: clone, log, status, add, commit, diff.
 * Uses the raw LightningFS instance (not the IFileSystem adapter) because
 * isomorphic-git expects the lightning-fs callback/promises interface.
 */
import type LightningFS from '@isomorphic-git/lightning-fs';
import git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import { defineCommand } from 'just-bash';

const CORS_PROXY = 'https://cors.isomorphic-git.org';

function repoName(url: string): string {
  const last = url.replace(/\/+$/, '').split('/').pop() ?? 'repo';
  return last.replace(/\.git$/, '');
}

// Status matrix HEAD → WORKDIR → STAGE codes
const STATUS_LABELS: Record<string, string> = {
  '020': 'new file',   // added to index, not in HEAD
  '022': 'new file',   // added to workdir + index
  '023': 'new file',   // added, staged
  '100': 'deleted',    // in HEAD but deleted
  '101': 'deleted',    // in HEAD, not in workdir
  '110': 'deleted',    // deleted from index
  '111': '',           // unchanged
  '121': 'modified',   // modified in workdir
  '122': 'modified',   // modified + staged
  '123': 'modified',   // modified, partially staged
};

export function createGitCommand(lfs: InstanceType<typeof LightningFS>) {
  const fs = lfs;

  return defineCommand('git', async (args, ctx) => {
    const sub = args[0];
    const cwd = ctx.cwd;
    console.log(`[git] subcommand=${sub} args=${JSON.stringify(args)} cwd=${cwd}`);

    try {
      if (sub === 'clone') {
        const url = args[1];
        if (!url) return { stdout: '', stderr: 'usage: git clone <url>\n', exitCode: 1 };

        const name = repoName(url);
        const dir = cwd === '/' ? `/${name}` : `${cwd}/${name}`;
        console.log(`[git clone] url=${url} dir=${dir}`);

        // Create target directory
        try { await fs.promises.mkdir(dir); } catch { /* may exist */ }

        console.log('[git clone] starting isomorphic-git clone...');
        await git.clone({
          fs, http, dir, url,
          corsProxy: CORS_PROXY,
          singleBranch: true,
          depth: 20,
        });
        console.log('[git clone] done');

        return { stdout: `Cloning into '${name}'...\ndone.\n`, stderr: '', exitCode: 0 };
      }

      if (sub === 'log') {
        const oneline = args.includes('--oneline');
        let n = 0;
        const nIdx = args.indexOf('-n');
        if (nIdx !== -1 && args[nIdx + 1]) n = parseInt(args[nIdx + 1], 10);
        // Also support -1, -2, etc.
        for (const a of args.slice(1)) {
          if (/^-\d+$/.test(a)) n = parseInt(a.slice(1), 10);
        }

        let commits = await git.log({ fs, dir: cwd });
        if (n > 0) commits = commits.slice(0, n);

        let out: string;
        if (oneline) {
          out = commits.map(c =>
            `\x1b[33m${c.oid.slice(0, 7)}\x1b[0m ${c.commit.message.split('\n')[0]}`
          ).join('\n') + '\n';
        } else {
          out = commits.map(c => {
            const date = new Date(c.commit.author.timestamp * 1000).toUTCString();
            return `\x1b[33mcommit ${c.oid}\x1b[0m\nAuthor: ${c.commit.author.name} <${c.commit.author.email}>\nDate:   ${date}\n\n    ${c.commit.message.split('\n')[0]}\n`;
          }).join('\n') + '\n';
        }
        return { stdout: out, stderr: '', exitCode: 0 };
      }

      if (sub === 'status') {
        const matrix = await git.statusMatrix({ fs, dir: cwd });
        const lines: string[] = [];

        for (const [filepath, head, workdir, stage] of matrix) {
          const key = `${head}${workdir}${stage}`;
          const label = STATUS_LABELS[key] ?? 'changed';
          if (label) {
            lines.push(`\t${label}:   ${filepath}`);
          }
        }

        if (lines.length === 0) {
          return { stdout: 'nothing to commit, working tree clean\n', stderr: '', exitCode: 0 };
        }

        return {
          stdout: `Changes:\n${lines.join('\n')}\n`,
          stderr: '',
          exitCode: 0,
        };
      }

      if (sub === 'add') {
        const filepath = args[1] ?? '.';
        if (filepath === '.') {
          // Add all changed files
          const matrix = await git.statusMatrix({ fs, dir: cwd });
          for (const [fp, , workdir] of matrix) {
            if (workdir === 0) {
              await git.remove({ fs, dir: cwd, filepath: fp as string });
            } else {
              await git.add({ fs, dir: cwd, filepath: fp as string });
            }
          }
        } else {
          await git.add({ fs, dir: cwd, filepath });
        }
        return { stdout: '', stderr: '', exitCode: 0 };
      }

      if (sub === 'commit') {
        let message = '';
        const mIdx = args.indexOf('-m');
        if (mIdx !== -1 && args[mIdx + 1]) {
          message = args[mIdx + 1];
        }
        if (!message) return { stdout: '', stderr: 'error: switch `m` requires a value\n', exitCode: 1 };

        const oid = await git.commit({
          fs,
          dir: cwd,
          message,
          author: { name: 'User', email: 'user@wterm' },
        });
        return { stdout: `[main ${oid.slice(0, 7)}] ${message}\n`, stderr: '', exitCode: 0 };
      }

      if (sub === 'diff') {
        // Minimal diff: show changed files
        const matrix = await git.statusMatrix({ fs, dir: cwd });
        const lines: string[] = [];
        for (const [filepath, head, workdir] of matrix) {
          if (head !== workdir) {
            lines.push(`diff --git a/${filepath} b/${filepath}`);
          }
        }
        return { stdout: lines.length ? lines.join('\n') + '\n' : '', stderr: '', exitCode: 0 };
      }

      return { stdout: '', stderr: `git: '${sub}' is not a git command.\n`, exitCode: 1 };
    } catch (e: any) {
      return { stdout: '', stderr: `fatal: ${e.message}\n`, exitCode: 128 };
    }
  });
}
