import { describe, test, expect } from 'vitest';
import { resolveByName } from '../../src/main/name-resolver';
import type { Session } from '../../src/main/session-store';

function makeSession(name: string, overrides?: Partial<Session>): Session {
  return {
    id: `id-${name}`,
    name,
    status: 'running',
    cwd: '/tmp',
    parentId: null,
    createdAt: Date.now(),
    ...overrides,
  };
}

// T-0300-07: name resolution — exact match, not found, ambiguous
describe('T-0300-07: name resolution — exact, not found, ambiguous', () => {
  test('exact match: "agent-1" resolves correctly even with "agent-11" present', () => {
    const sessions = [makeSession('agent-1'), makeSession('agent-11')];
    const result = resolveByName(sessions, 'agent-1');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session.name).toBe('agent-1');
    }
  });

  test('not found: lookup "nonexistent" → error', () => {
    const sessions = [makeSession('agent-1'), makeSession('agent-2')];
    const result = resolveByName(sessions, 'nonexistent');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("no session named 'nonexistent'");
    }
  });

  test('close match: lookup "agNEt-1" (transposed e/n) → error with "did you mean"', () => {
    const sessions = [makeSession('agent-1'), makeSession('agent-2')];
    const result = resolveByName(sessions, 'agnet-1');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('did you mean');
      expect(result.error).toContain('agent-1');
    }
  });

  test('ambiguous: two sessions with same name → error listing both', () => {
    const sessions = [
      makeSession('agent-1', { id: 'id-a' }),
      makeSession('agent-1', { id: 'id-b' }),
    ];
    const result = resolveByName(sessions, 'agent-1');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('ambiguous');
    }
  });

  test('empty session list → not found', () => {
    const result = resolveByName([], 'anything');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("no session named 'anything'");
    }
  });
});
