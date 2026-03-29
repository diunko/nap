import { MemoryFileSystem } from '../src/main/filesystem';

// ── F1: minimal project ──
export function createMinimalFixture(): MemoryFileSystem {
  return new MemoryFileSystem({
    'nepic/30-napkins/0100-explore/.napkin.nap.json': { status: 'doing' },
    'nepic/30-napkins/0100-explore/agents/001-test-arch/.agent.nap.json': {
      cc_session_uuid: 'uuid-ta',
      role: 'test-arch',
      name: '001-test-arch',
      created_at: 1711700000000,
    },
    'nepic/20-architects/001-architect/.agent.nap.json': {
      cc_session_uuid: 'uuid-arch',
      role: 'architect',
      name: '001-architect',
      created_at: 1711600000000,
    },
  });
}

// ── F2: rich project (3 napkins × mixed agents + statuses) ──
export function createRichFixture(): MemoryFileSystem {
  return new MemoryFileSystem({
    'nepic/30-napkins/0100-explore/.napkin.nap.json': { status: 'done' },
    'nepic/30-napkins/0100-explore/agents/001-test-arch/.agent.nap.json': {
      cc_session_uuid: 'uuid-1',
      role: 'test-arch',
      name: '001-test-arch',
      created_at: 1711700000000,
    },
    'nepic/30-napkins/0100-explore/agents/002-fs-eng/.agent.nap.json': {
      cc_session_uuid: 'uuid-2',
      role: 'fs-eng',
      name: '002-fs-eng',
      created_at: 1711700100000,
    },

    'nepic/30-napkins/0200-build/.napkin.nap.json': { status: 'doing' },
    'nepic/30-napkins/0200-build/agents/001-fs-eng/.agent.nap.json': {
      cc_session_uuid: 'uuid-3',
      role: 'fs-eng',
      name: '001-fs-eng',
      created_at: 1711800000000,
    },

    'nepic/30-napkins/0300-polish/.napkin.nap.json': { status: 'backlog' },

    'nepic/20-architects/001-architect/.agent.nap.json': {
      cc_session_uuid: 'uuid-arch',
      role: 'architect',
      name: '001-architect',
      created_at: 1711600000000,
    },
  });
}

// ── F3: empty project (dirs exist, no markers) ──
export function createEmptyFixture(): MemoryFileSystem {
  // Use null values as directory markers
  return new MemoryFileSystem({
    'nepic/30-napkins/0100-explore/agents/001-test-arch/.placeholder': null,
    'nepic/20-architects/.placeholder': null,
  });
}

// ── F4: exited agent ──
export function createExitedAgentFixture(): MemoryFileSystem {
  return new MemoryFileSystem({
    'nepic/30-napkins/0100-explore/.napkin.nap.json': { status: 'doing' },
    'nepic/30-napkins/0100-explore/agents/001-test-arch/.agent.nap.json': {
      cc_session_uuid: 'uuid-exited',
      role: 'test-arch',
      name: '001-test-arch',
      created_at: 1711700000000,
      exited: true,
    },
  });
}

// ── F5: no architects ──
export function createNoArchitectsFixture(): MemoryFileSystem {
  return new MemoryFileSystem({
    'nepic/30-napkins/0100-explore/.napkin.nap.json': { status: 'doing' },
    'nepic/30-napkins/0100-explore/agents/001-fs-eng/.agent.nap.json': {
      cc_session_uuid: 'uuid-1',
      role: 'fs-eng',
      name: '001-fs-eng',
      created_at: 1711700000000,
    },
  });
}

// ── Combined F3+F4 for journey test T-0100-22 ──
export function createEdgeCaseFixture(): MemoryFileSystem {
  return new MemoryFileSystem({
    // Napkin with missing marker (dir only)
    'nepic/30-napkins/0100-explore/agents/001-test-arch/.placeholder': null,

    // Napkin with exited agent
    'nepic/30-napkins/0200-build/.napkin.nap.json': { status: 'doing' },
    'nepic/30-napkins/0200-build/agents/001-fs-eng/.agent.nap.json': {
      cc_session_uuid: 'uuid-exited',
      role: 'fs-eng',
      name: '001-fs-eng',
      created_at: 1711700000000,
      exited: true,
    },
  });
}

export const NEPIC_DIR = 'nepic';
