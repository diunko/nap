import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
// Import only the pure functions — nap.ts has a top-level main() that calls process.exit,
// so we replicate the functions here to avoid the side effect.

/** Shell-escape a string for use inside single quotes. */
function shellEscape(s: string): string {
  return s.replace(/'/g, "'\\''");
}

/** Build the pty command for a claude session from the new-form prompt. */
function buildClaudeCommand(prompt: string): string {
  if (!prompt) return 'claude --verbose';
  return `claude --verbose '${shellEscape(prompt)}'`;
}

// ---------------------------------------------------------------------------
// Real shell round-trip: construct command → bash -c → fake claude → verify
// ---------------------------------------------------------------------------

let fakeBinDir: string;
let fakeClaude: string;

beforeAll(() => {
  // Create a fake "claude" that writes all its args to a temp file, one per line.
  // This lets us verify exactly what the shell delivered.
  fakeBinDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-quoting-'));
  fakeClaude = path.join(fakeBinDir, 'claude');
  fs.writeFileSync(
    fakeClaude,
    `#!/bin/bash
# Write each arg on its own line to the file specified by ARGS_FILE
for arg in "$@"; do
  echo "$arg" >> "$ARGS_FILE"
done
`,
    { mode: 0o755 },
  );
});

afterAll(() => {
  fs.rmSync(fakeBinDir, { recursive: true, force: true });
});

/** Run a command through bash and return what the fake claude received as args */
function shellRoundTrip(command: string): string[] {
  const argsFile = path.join(fakeBinDir, `args-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  try {
    execSync(command, {
      env: { ...process.env, PATH: `${fakeBinDir}:${process.env.PATH}`, ARGS_FILE: argsFile },
      shell: '/bin/bash',
      timeout: 5000,
    });
    if (!fs.existsSync(argsFile)) return [];
    return fs.readFileSync(argsFile, 'utf-8').split('\n').filter(Boolean);
  } finally {
    try { fs.unlinkSync(argsFile); } catch { /* ok */ }
  }
}

// ---------------------------------------------------------------------------
// shellEscape unit tests (pure string, no shell)
// ---------------------------------------------------------------------------

describe('shellEscape', () => {
  test('no special chars → unchanged', () => {
    expect(shellEscape('read prompt.md')).toBe('read prompt.md');
  });

  test("single quote → end-quote, escaped, reopen", () => {
    expect(shellEscape("it's")).toBe("it'\\''s");
  });

  test('multiple single quotes', () => {
    expect(shellEscape("it's a 'test'")).toBe("it'\\''s a '\\''test'\\''");
  });
});

// ---------------------------------------------------------------------------
// buildClaudeCommand unit tests (pure string)
// ---------------------------------------------------------------------------

describe('buildClaudeCommand', () => {
  test('empty prompt → just claude --verbose', () => {
    expect(buildClaudeCommand('')).toBe('claude --verbose');
  });

  test('simple prompt → single-quoted', () => {
    expect(buildClaudeCommand('read prompt.md')).toBe("claude --verbose 'read prompt.md'");
  });

  test('prompt with double quotes → preserved inside single quotes', () => {
    expect(buildClaudeCommand('read "prompt.md"')).toBe(`claude --verbose 'read "prompt.md"'`);
  });
});

// ---------------------------------------------------------------------------
// Shell round-trip tests — the real deal
// ---------------------------------------------------------------------------

describe('shell round-trip: prompt survives bash -c', () => {
  test('simple prompt', () => {
    const cmd = buildClaudeCommand('read prompt.md and follow its instructions');
    const args = shellRoundTrip(cmd);
    expect(args).toContain('--verbose');
    expect(args).toContain('read prompt.md and follow its instructions');
  });

  test('prompt with double quotes', () => {
    const cmd = buildClaudeCommand('read "prompt.md" and follow its instructions');
    const args = shellRoundTrip(cmd);
    expect(args).toContain('read "prompt.md" and follow its instructions');
  });

  test('prompt with single quotes', () => {
    const cmd = buildClaudeCommand("it's a test");
    const args = shellRoundTrip(cmd);
    expect(args).toContain("it's a test");
  });

  test('prompt with both quote types', () => {
    const cmd = buildClaudeCommand(`read "it's a file"`);
    const args = shellRoundTrip(cmd);
    expect(args).toContain(`read "it's a file"`);
  });

  test('prompt with dollar sign (no expansion)', () => {
    const cmd = buildClaudeCommand('echo $HOME and $PATH');
    const args = shellRoundTrip(cmd);
    expect(args).toContain('echo $HOME and $PATH');
  });

  test('prompt with backticks (no expansion)', () => {
    const cmd = buildClaudeCommand('run `whoami` here');
    const args = shellRoundTrip(cmd);
    expect(args).toContain('run `whoami` here');
  });

  test('prompt with backslashes', () => {
    const cmd = buildClaudeCommand('path\\to\\file');
    const args = shellRoundTrip(cmd);
    expect(args).toContain('path\\to\\file');
  });

  test('prompt with newline literal', () => {
    const cmd = buildClaudeCommand('line1\\nline2');
    const args = shellRoundTrip(cmd);
    expect(args).toContain('line1\\nline2');
  });

  test('empty prompt → no prompt arg, just --verbose', () => {
    const cmd = buildClaudeCommand('');
    const args = shellRoundTrip(cmd);
    expect(args).toEqual(['--verbose']);
  });
});
