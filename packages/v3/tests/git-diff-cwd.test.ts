import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, execFile } from 'child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { rmSync } from 'fs';

function gitExec(args: string[], cwd: string): Promise<{ stdout: string; err: Error | null }> {
  return new Promise((resolve) => {
    execFile('git', args, { cwd }, (err, stdout) => {
      resolve({ stdout, err });
    });
  });
}

describe('git diff cwd — uses dirname(filePath)', () => {
  let repoA: string;
  let repoB: string;
  let fileA: string;
  let fileB: string;

  beforeAll(() => {
    // Create two independent git repos in temp dirs
    repoA = mkdtempSync(join(tmpdir(), 'git-cwd-a-'));
    repoB = mkdtempSync(join(tmpdir(), 'git-cwd-b-'));

    for (const repo of [repoA, repoB]) {
      execFileSync('git', ['init'], { cwd: repo });
      execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: repo });
      execFileSync('git', ['config', 'user.name', 'Test'], { cwd: repo });
    }

    // Commit a file in each repo
    fileA = join(repoA, 'file.txt');
    writeFileSync(fileA, 'original A\n');
    execFileSync('git', ['add', 'file.txt'], { cwd: repoA });
    execFileSync('git', ['commit', '-m', 'init A'], { cwd: repoA });

    fileB = join(repoB, 'file.txt');
    writeFileSync(fileB, 'original B\n');
    execFileSync('git', ['add', 'file.txt'], { cwd: repoB });
    execFileSync('git', ['commit', '-m', 'init B'], { cwd: repoB });

    // Modify both files (unstaged changes)
    writeFileSync(fileA, 'modified A\n');
    writeFileSync(fileB, 'modified B\n');
  });

  afterAll(() => {
    rmSync(repoA, { recursive: true, force: true });
    rmSync(repoB, { recursive: true, force: true });
  });

  // T-01: git ls-files uses dirname as cwd
  it('git ls-files resolves correct repo via dirname(filePath)', async () => {
    const resultA = await gitExec(
      ['ls-files', '--error-unmatch', fileA],
      dirname(fileA),
    );
    expect(resultA.err).toBeNull();

    const resultB = await gitExec(
      ['ls-files', '--error-unmatch', fileB],
      dirname(fileB),
    );
    expect(resultB.err).toBeNull();
  });

  // T-02: git diff uses dirname as cwd
  it('git diff resolves correct repo via dirname(filePath)', async () => {
    const resultA = await gitExec(
      ['diff', '--unified=0', 'HEAD', '--', fileA],
      dirname(fileA),
    );
    expect(resultA.err).toBeNull();
    expect(resultA.stdout).toContain('-original A');
    expect(resultA.stdout).toContain('+modified A');

    const resultB = await gitExec(
      ['diff', '--unified=0', 'HEAD', '--', fileB],
      dirname(fileB),
    );
    expect(resultB.err).toBeNull();
    expect(resultB.stdout).toContain('-original B');
    expect(resultB.stdout).toContain('+modified B');
  });

  // Cross-check: using the wrong repo's cwd fails or returns wrong results
  it('using wrong cwd would fail ls-files (proving cwd matters)', async () => {
    const result = await gitExec(
      ['ls-files', '--error-unmatch', fileA],
      dirname(fileB), // wrong repo
    );
    // fileA is not tracked in repoB
    expect(result.err).not.toBeNull();
  });
});
