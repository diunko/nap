import { describe, it, expect } from 'vitest';
import { resolveByName } from '../src/main/name-resolver';
import type { AgentState } from '../src/shared/bridge-types';

function makeAgent(overrides: Partial<AgentState> & { name: string }): AgentState {
  return {
    id: overrides.id || 'uuid-' + overrides.name,
    name: overrides.name,
    role: overrides.role || 'test',
    nepicId: overrides.nepicId || 'test-nepic',
    napkinId: overrides.napkinId || null,
    parentName: null,
    parentId: null,
    createdAt: 0,
    started: false,
    exited: false,
    running: false,
    done: false,
    archived: false,
    pendingApproval: null,
    homePath: '/test/' + overrides.name,
    ...overrides,
  };
}

const F10_AGENTS: AgentState[] = [
  makeAgent({ name: '001-test-arch', id: 'uuid-ta', role: 'test-arch', napkinId: '0100-explore' }),
  makeAgent({ name: '002-fs-eng', id: 'uuid-fs', role: 'fs-eng', napkinId: '0100-explore' }),
  makeAgent({ name: '001-fs-eng', id: 'uuid-fresh', role: 'fs-eng', napkinId: '0200-build' }),
  makeAgent({ name: '001-architect', id: 'uuid-arch', role: 'architect' }),
];

describe('Name resolver', () => {
  // T-0210-10
  it('exact match returns agent', () => {
    const result = resolveByName(F10_AGENTS, '001-test-arch');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.agent.name).toBe('001-test-arch');
    }
  });

  // T-0210-11
  it('no match returns suggestions (Levenshtein ≤ 2)', () => {
    const result = resolveByName(F10_AGENTS, 'test-arch');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('did you mean');
      expect(result.error).toContain('001-test-arch');
    }
  });

  // T-0210-12
  it('no match and no similar names returns clean error', () => {
    const result = resolveByName(F10_AGENTS, 'zzzz-nonexistent');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('no agent named');
      expect(result.error).not.toContain('did you mean');
    }
  });

  // T-0210-13
  it('name resolution scoped to nepic', () => {
    const activeNepicAgents = F10_AGENTS.filter((a) => a.nepicId === 'test-nepic');
    const result = resolveByName(activeNepicAgents, '001-architect');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.agent.nepicId).toBe('test-nepic');
    }
  });

  // T-0210-14 — duplicate detection tested in model tests (createAgentStub)
});
