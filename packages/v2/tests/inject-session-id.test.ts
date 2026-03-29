import { describe, test, expect } from 'vitest';
import { injectSessionId } from '../src/main/inject-session-id';

// =========================================================================
// T-0200-04: --session-id injection into command string
// =========================================================================
describe('T-0200-04: --session-id injection into command string', () => {
  const uuid = '550e8400-e29b-41d4-a716-446655440000';

  test('claude --verbose "read prompt.md" → injected after first token', () => {
    expect(injectSessionId('claude --verbose "read prompt.md"', uuid)).toBe(
      `claude --session-id ${uuid} --verbose "read prompt.md"`,
    );
  });

  test('bare "claude" → claude --session-id <uuid>', () => {
    expect(injectSessionId('claude', uuid)).toBe(
      `claude --session-id ${uuid}`,
    );
  });

  test('claude "prompt with spaces" → preserves quoted args', () => {
    expect(injectSessionId('claude "prompt with spaces"', uuid)).toBe(
      `claude --session-id ${uuid} "prompt with spaces"`,
    );
  });

  test('non-claude command → no injection', () => {
    expect(injectSessionId('echo hello', uuid)).toBe('echo hello');
    expect(injectSessionId('node script.js', uuid)).toBe('node script.js');
    expect(injectSessionId('python -c "print(1)"', uuid)).toBe(
      'python -c "print(1)"',
    );
  });

  test('claude-like prefix (claudebot) → no injection', () => {
    expect(injectSessionId('claudebot run', uuid)).toBe('claudebot run');
  });
});
