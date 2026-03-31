import { MemoryFileSystem } from '../src/main/filesystem';
import type { NepicInfo } from '../src/shared/bridge-types';

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

// ── F6: lifecycle fixture (for write/watch testing — same data as F1) ──
export function createLifecycleFixture(): MemoryFileSystem {
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

// ── F7: multi-napkin lifecycle (concurrent operations + debounce) ──
export function createMultiNapkinLifecycleFixture(): MemoryFileSystem {
  return new MemoryFileSystem({
    'nepic/30-napkins/0100-explore/.napkin.nap.json': { status: 'doing' },
    'nepic/30-napkins/0100-explore/agents/001-test-arch/.agent.nap.json': {
      cc_session_uuid: 'uuid-1',
      role: 'test-arch',
      name: '001-test-arch',
      created_at: 1711700000000,
    },
    'nepic/30-napkins/0200-build/.napkin.nap.json': { status: 'backlog' },
  });
}

// ── F8: survivability fixture (three agent cases) ──
export function createSurvivabilityFixture(): MemoryFileSystem {
  return new MemoryFileSystem({
    'nepic/30-napkins/0100-explore/.napkin.nap.json': { status: 'doing', nepic: 'test-nepic' },
    'nepic/30-napkins/0100-explore/agents/001-test-arch/.agent.nap.json': {
      cc_session_uuid: 'uuid-ta',
      role: 'test-arch',
      name: '001-test-arch',
      napkin: '0100-explore',
      nepic: 'test-nepic',
      parent: null,
      parent_id: null,
      created_at: 1711700000000,
      started: true,
      exited: false,
    },
    'nepic/30-napkins/0100-explore/agents/002-fs-eng/.agent.nap.json': {
      cc_session_uuid: 'uuid-fs',
      role: 'fs-eng',
      name: '002-fs-eng',
      napkin: '0100-explore',
      nepic: 'test-nepic',
      parent: '001-test-arch',
      parent_id: 'uuid-ta',
      created_at: 1711700100000,
      started: true,
      exited: true,
    },
    'nepic/30-napkins/0200-build/.napkin.nap.json': { status: 'backlog', nepic: 'test-nepic' },
    'nepic/30-napkins/0200-build/agents/001-fs-eng/.agent.nap.json': {
      cc_session_uuid: 'uuid-fresh',
      role: 'fs-eng',
      name: '001-fs-eng',
      napkin: '0200-build',
      nepic: 'test-nepic',
      parent: null,
      parent_id: null,
      created_at: 1711800000000,
      started: false,
      exited: false,
    },
    'nepic/20-architects/001-architect/.agent.nap.json': {
      cc_session_uuid: 'uuid-arch',
      role: 'architect',
      name: '001-architect',
      nepic: 'test-nepic',
      parent: null,
      parent_id: null,
      created_at: 1711600000000,
      started: true,
      exited: false,
    },
  });
}

// ── F9: all-exited fixture ──
export function createAllExitedFixture(): MemoryFileSystem {
  return new MemoryFileSystem({
    'nepic/30-napkins/0100-explore/.napkin.nap.json': { status: 'done', nepic: 'test-nepic' },
    'nepic/30-napkins/0100-explore/agents/001-test-arch/.agent.nap.json': {
      cc_session_uuid: 'uuid-1',
      role: 'test-arch',
      name: '001-test-arch',
      nepic: 'test-nepic',
      created_at: 1711700000000,
      started: true,
      exited: true,
    },
    'nepic/20-architects/001-architect/.agent.nap.json': {
      cc_session_uuid: 'uuid-arch',
      role: 'architect',
      name: '001-architect',
      nepic: 'test-nepic',
      created_at: 1711600000000,
      started: true,
      exited: true,
    },
  });
}

// ── F10: CLI integration fixture (agents in various lifecycle states) ──
export function createCliIntegrationFixture(): MemoryFileSystem {
  return new MemoryFileSystem({
    'nepic/30-napkins/0100-explore/.napkin.nap.json': { status: 'doing', nepic: 'test-nepic' },
    'nepic/30-napkins/0100-explore/agents/001-test-arch/.agent.nap.json': {
      cc_session_uuid: 'uuid-ta',
      role: 'test-arch',
      name: '001-test-arch',
      napkin: '0100-explore',
      nepic: 'test-nepic',
      parent: '001-architect',
      parent_id: 'uuid-arch',
      created_at: 1711700000000,
      started: true,
      exited: false,
    },
    'nepic/30-napkins/0100-explore/agents/002-fs-eng/.agent.nap.json': {
      cc_session_uuid: 'uuid-fs',
      role: 'fs-eng',
      name: '002-fs-eng',
      napkin: '0100-explore',
      nepic: 'test-nepic',
      parent: '001-test-arch',
      parent_id: 'uuid-ta',
      created_at: 1711700100000,
      started: true,
      exited: true,
    },
    'nepic/30-napkins/0200-build/.napkin.nap.json': { status: 'backlog', nepic: 'test-nepic' },
    'nepic/30-napkins/0200-build/agents/001-fs-eng/.agent.nap.json': {
      cc_session_uuid: 'uuid-fresh',
      role: 'fs-eng',
      name: '001-fs-eng',
      napkin: '0200-build',
      nepic: 'test-nepic',
      parent: null,
      parent_id: null,
      created_at: 1711800000000,
      started: false,
      exited: false,
    },
    'nepic/20-architects/001-architect/.agent.nap.json': {
      cc_session_uuid: 'uuid-arch',
      role: 'architect',
      name: '001-architect',
      nepic: 'test-nepic',
      parent: null,
      parent_id: null,
      created_at: 1711600000000,
      started: true,
      exited: false,
    },
  });
}

// ── F11: empty nepic (for create-from-scratch flows) ──
export function createEmptyNepicFixture(): MemoryFileSystem {
  return new MemoryFileSystem({
    'nepic/20-architects/001-architect/.agent.nap.json': {
      cc_session_uuid: 'uuid-arch',
      role: 'architect',
      name: '001-architect',
      nepic: 'test-nepic',
      created_at: 1711600000000,
      started: true,
      exited: false,
    },
    'nepic/30-napkins/.placeholder': null,
  });
}

// ── F12: zoom fixture (agents in all lifecycle states + content files) ──
export function createZoomFixture(): MemoryFileSystem {
  return new MemoryFileSystem({
    'nepic/30-napkins/0100-explore/.napkin.nap.json': { status: 'doing' },
    'nepic/30-napkins/0100-explore/0100-explore.nap.md': {} as object,
    'nepic/30-napkins/0100-explore/0100-explore.spec.md': {} as object,
    'nepic/30-napkins/0100-explore/agents/001-test-arch/.agent.nap.json': {
      cc_session_uuid: 'uuid-ta',
      role: 'test-arch',
      name: '001-test-arch',
      created_at: 1711700000000,
      started: true,
      exited: false,
    },
    'nepic/30-napkins/0100-explore/agents/002-fs-eng/.agent.nap.json': {
      cc_session_uuid: 'uuid-fs',
      role: 'fs-eng',
      name: '002-fs-eng',
      created_at: 1711700100000,
      started: true,
      exited: true,
      done: true,
    },
    'nepic/30-napkins/0100-explore/agents/003-reviewer/.agent.nap.json': {
      cc_session_uuid: 'uuid-rv',
      role: 'reviewer',
      name: '003-reviewer',
      created_at: 1711700200000,
      started: false,
      exited: false,
    },
    'nepic/30-napkins/0200-build/.napkin.nap.json': { status: 'backlog' },
    'nepic/30-napkins/0200-build/0200-build.nap.md': {} as object,
    'nepic/20-architects/001-architect/.agent.nap.json': {
      cc_session_uuid: 'uuid-arch',
      role: 'architect',
      name: '001-architect',
      created_at: 1711600000000,
      started: true,
      exited: false,
    },
    'nepic/20-architects/001-architect/prompt.md': {} as object,
    'nepic/20-architects/001-architect/scratch/notes.md': {} as object,
    'nepic/20-architects/001-architect/onboarding/setup.md': {} as object,
  });
}

// ── F13: dot color state matrix (one agent per lifecycle state) ──
export function createDotMatrixFixture(): MemoryFileSystem {
  return new MemoryFileSystem({
    'nepic/30-napkins/0100-dots/.napkin.nap.json': { status: 'doing' },
    'nepic/30-napkins/0100-dots/agents/001-running/.agent.nap.json': {
      cc_session_uuid: 'uuid-running',
      role: 'test-arch',
      name: '001-running',
      created_at: 1711700000000,
      started: true,
      exited: false,
    },
    'nepic/30-napkins/0100-dots/agents/002-done/.agent.nap.json': {
      cc_session_uuid: 'uuid-done',
      role: 'fs-eng',
      name: '002-done',
      created_at: 1711700100000,
      started: true,
      exited: false,
      done: true,
    },
    'nepic/30-napkins/0100-dots/agents/003-done-exit/.agent.nap.json': {
      cc_session_uuid: 'uuid-done-exit',
      role: 'test-arch',
      name: '003-done-exit',
      created_at: 1711700200000,
      started: true,
      exited: true,
      done: true,
    },
    'nepic/30-napkins/0100-dots/agents/004-exited/.agent.nap.json': {
      cc_session_uuid: 'uuid-exited',
      role: 'fs-eng',
      name: '004-exited',
      created_at: 1711700300000,
      started: true,
      exited: true,
    },
    'nepic/30-napkins/0100-dots/agents/005-waiting/.agent.nap.json': {
      cc_session_uuid: 'uuid-waiting',
      role: 'test-eng',
      name: '005-waiting',
      created_at: 1711700400000,
      started: false,
      exited: false,
    },
  });
}

// F12 fixture data for medium tests
export const F12_FIXTURE: Record<string, object | null> = {
  'nepic/30-napkins/0100-explore/.napkin.nap.json': { status: 'doing' },
  'nepic/30-napkins/0100-explore/0100-explore.nap.md': {},
  'nepic/30-napkins/0100-explore/0100-explore.spec.md': {},
  'nepic/30-napkins/0100-explore/agents/001-test-arch/.agent.nap.json': {
    cc_session_uuid: 'uuid-ta',
    role: 'test-arch',
    name: '001-test-arch',
    created_at: 1711700000000,
    started: true,
    exited: false,
  },
  'nepic/30-napkins/0100-explore/agents/002-fs-eng/.agent.nap.json': {
    cc_session_uuid: 'uuid-fs',
    role: 'fs-eng',
    name: '002-fs-eng',
    created_at: 1711700100000,
    started: true,
    exited: true,
    done: true,
  },
  'nepic/30-napkins/0100-explore/agents/003-reviewer/.agent.nap.json': {
    cc_session_uuid: 'uuid-rv',
    role: 'reviewer',
    name: '003-reviewer',
    created_at: 1711700200000,
    started: false,
    exited: false,
  },
  'nepic/30-napkins/0200-build/.napkin.nap.json': { status: 'backlog' },
  'nepic/30-napkins/0200-build/0200-build.nap.md': {},
  'nepic/20-architects/001-architect/.agent.nap.json': {
    cc_session_uuid: 'uuid-arch',
    role: 'architect',
    name: '001-architect',
    created_at: 1711600000000,
    started: true,
    exited: false,
  },
  'nepic/20-architects/001-architect/prompt.md': {},
  'nepic/20-architects/001-architect/scratch/notes.md': {},
  'nepic/20-architects/001-architect/onboarding/setup.md': {},
};

export const NEPIC_DIR = 'nepic';

// F10 fixture data for medium tests
export const F10_FIXTURE: Record<string, object | null> = {
  'nepic/30-napkins/0100-explore/.napkin.nap.json': { status: 'doing', nepic: 'test-nepic' },
  'nepic/30-napkins/0100-explore/agents/001-test-arch/.agent.nap.json': {
    cc_session_uuid: 'uuid-ta',
    role: 'test-arch',
    name: '001-test-arch',
    napkin: '0100-explore',
    nepic: 'test-nepic',
    parent: '001-architect',
    parent_id: 'uuid-arch',
    created_at: 1711700000000,
    started: true,
    exited: false,
  },
  'nepic/30-napkins/0100-explore/agents/002-fs-eng/.agent.nap.json': {
    cc_session_uuid: 'uuid-fs',
    role: 'fs-eng',
    name: '002-fs-eng',
    napkin: '0100-explore',
    nepic: 'test-nepic',
    parent: '001-test-arch',
    parent_id: 'uuid-ta',
    created_at: 1711700100000,
    started: true,
    exited: true,
  },
  'nepic/30-napkins/0200-build/.napkin.nap.json': { status: 'backlog', nepic: 'test-nepic' },
  'nepic/30-napkins/0200-build/agents/001-fs-eng/.agent.nap.json': {
    cc_session_uuid: 'uuid-fresh',
    role: 'fs-eng',
    name: '001-fs-eng',
    napkin: '0200-build',
    nepic: 'test-nepic',
    parent: null,
    parent_id: null,
    created_at: 1711800000000,
    started: false,
    exited: false,
  },
  'nepic/20-architects/001-architect/.agent.nap.json': {
    cc_session_uuid: 'uuid-arch',
    role: 'architect',
    name: '001-architect',
    nepic: 'test-nepic',
    parent: null,
    parent_id: null,
    created_at: 1711600000000,
    started: true,
    exited: false,
  },
};

// ── F14: kanban fixture (5 napkins across all phases + agents with bullets) ──
export function createKanbanFixture(): MemoryFileSystem {
  return new MemoryFileSystem({
    'nepic/30-napkins/0100-design/.napkin.nap.json': { status: 'done' },
    'nepic/30-napkins/0100-design/0100-design.nap.md': '* design system\n* color tokens\n* typography',
    'nepic/30-napkins/0100-design/agents/001-test-arch/.agent.nap.json': {
      cc_session_uuid: 'uuid-d-ta',
      role: 'test-arch',
      name: '001-test-arch',
      created_at: 1711700000000,
      started: true,
      exited: true,
      done: true,
    },
    'nepic/30-napkins/0100-design/agents/002-fs-eng/.agent.nap.json': {
      cc_session_uuid: 'uuid-d-fs',
      role: 'fs-eng',
      name: '002-fs-eng',
      created_at: 1711700100000,
      started: true,
      exited: true,
      done: true,
    },

    'nepic/30-napkins/0200-model/.napkin.nap.json': { status: 'doing' },
    'nepic/30-napkins/0200-model/0200-model.nap.md': '* state machine\n* snapshot protocol',
    'nepic/30-napkins/0200-model/agents/001-fs-eng/.agent.nap.json': {
      cc_session_uuid: 'uuid-m-fs',
      role: 'fs-eng',
      name: '001-fs-eng',
      created_at: 1711800000000,
      started: true,
      exited: false,
    },

    'nepic/30-napkins/0300-sidebar/.napkin.nap.json': { status: 'review' },
    'nepic/30-napkins/0300-sidebar/0300-sidebar.nap.md': '* sidebar component',
    'nepic/30-napkins/0300-sidebar/0300-sidebar.spec.md': '## spec',

    'nepic/30-napkins/0400-zoom/.napkin.nap.json': { status: 'todo' },

    'nepic/30-napkins/0500-kanban/.napkin.nap.json': { status: 'backlog' },

    'nepic/20-architects/001-architect/.agent.nap.json': {
      cc_session_uuid: 'uuid-arch',
      role: 'architect',
      name: '001-architect',
      created_at: 1711600000000,
      started: true,
      exited: false,
    },
  });
}

export const F14_FIXTURE: Record<string, object | string | null> = {
  'nepic/30-napkins/0100-design/.napkin.nap.json': { status: 'done' },
  'nepic/30-napkins/0100-design/0100-design.nap.md': '* design system\n* color tokens\n* typography',
  'nepic/30-napkins/0100-design/agents/001-test-arch/.agent.nap.json': {
    cc_session_uuid: 'uuid-d-ta',
    role: 'test-arch',
    name: '001-test-arch',
    created_at: 1711700000000,
    started: true,
    exited: true,
    done: true,
  },
  'nepic/30-napkins/0100-design/agents/002-fs-eng/.agent.nap.json': {
    cc_session_uuid: 'uuid-d-fs',
    role: 'fs-eng',
    name: '002-fs-eng',
    created_at: 1711700100000,
    started: true,
    exited: true,
    done: true,
  },
  'nepic/30-napkins/0200-model/.napkin.nap.json': { status: 'doing' },
  'nepic/30-napkins/0200-model/0200-model.nap.md': '* state machine\n* snapshot protocol',
  'nepic/30-napkins/0200-model/agents/001-fs-eng/.agent.nap.json': {
    cc_session_uuid: 'uuid-m-fs',
    role: 'fs-eng',
    name: '001-fs-eng',
    created_at: 1711800000000,
    started: true,
    exited: false,
  },
  'nepic/30-napkins/0300-sidebar/.napkin.nap.json': { status: 'review' },
  'nepic/30-napkins/0300-sidebar/0300-sidebar.nap.md': '* sidebar component',
  'nepic/30-napkins/0300-sidebar/0300-sidebar.spec.md': '## spec',
  'nepic/30-napkins/0400-zoom/.napkin.nap.json': { status: 'todo' },
  'nepic/30-napkins/0500-kanban/.napkin.nap.json': { status: 'backlog' },
  'nepic/20-architects/001-architect/.agent.nap.json': {
    cc_session_uuid: 'uuid-arch',
    role: 'architect',
    name: '001-architect',
    created_at: 1711600000000,
    started: true,
    exited: false,
  },
};

// ── F15: multi-nepic fixture (3 nepics — for gutter and switching tests) ──
export function createMultiNepicFixture(): MemoryFileSystem {
  return new MemoryFileSystem({
    'nepics/01-v1/30-napkins/0100-explore/.napkin.nap.json': { status: 'doing' },
    'nepics/01-v1/30-napkins/0100-explore/agents/001-fs-eng/.agent.nap.json': {
      cc_session_uuid: 'uuid-v1-fs',
      role: 'fs-eng',
      name: '001-fs-eng',
      created_at: 1711700000000,
      started: true,
    },
    'nepics/01-v1/20-architects/001-architect/.agent.nap.json': {
      cc_session_uuid: 'uuid-v1-arch',
      role: 'architect',
      name: '001-architect',
      created_at: 1711600000000,
      started: true,
    },

    'nepics/02-spaces/30-napkins/0100-design/.napkin.nap.json': { status: 'done' },
    'nepics/02-spaces/20-architects/001-architect/.agent.nap.json': {
      cc_session_uuid: 'uuid-s-arch',
      role: 'architect',
      name: '001-architect',
      created_at: 1711600000000,
      started: true,
    },

    'nepics/03-kanban/30-napkins/0100-board/.napkin.nap.json': { status: 'backlog' },
    'nepics/03-kanban/20-architects/001-architect/.agent.nap.json': {
      cc_session_uuid: 'uuid-k-arch',
      role: 'architect',
      name: '001-architect',
      created_at: 1711600000000,
      started: false,
    },
  });
}

export const F15_NEPIC_DIR = 'nepics/01-v1';
