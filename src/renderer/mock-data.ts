// Mock data for NapkinBrowser — hardcoded for layout development.
// Will be replaced with real filesystem/SQLite data later.

export type AgentStatus = 'run' | 'done' | 'nap' | 'exit';
export type NapkinPhase = 'done' | 'review' | 'doing' | 'todo' | 'backlog';

export interface MockAgent {
  name: string;
  terminalId?: string; // maps to terminal registry
  status: AgentStatus;
}

export interface MockArtifact {
  name: string;
  path: string;
}

export interface MockNapkin {
  slug: string;
  name: string;
  phase: NapkinPhase;
  artifacts: MockArtifact[];
  agents: MockAgent[];
  // Extended view — nested files
  extendedFiles?: { name: string; path: string; indent?: number }[];
}

export interface MockArchitect {
  slug: string;
  name: string;
  status: AgentStatus;
  label: string; // 'acting' | 'done' etc.
  terminalId?: string;
  artifacts: MockArtifact[];
  extendedFiles?: { name: string; path: string; indent?: number }[];
}

export interface MockNepic {
  id: string;
  label: string;
  active: boolean;
}

// ── Nepics ──

export const MOCK_NEPICS: MockNepic[] = [
  { id: 'poc', label: 'P', active: false },
  { id: 'spaces', label: 'S', active: true },
  { id: 'add', label: '+', active: false },
];

// ── Architects ──

export const MOCK_ARCHITECTS: MockArchitect[] = [
  {
    slug: '002-nova',
    name: '002-nova',
    status: 'run',
    label: 'acting',
    artifacts: [
      { name: 'onboarding/', path: 'onboarding/' },
      { name: 'scratch/', path: 'scratch/' },
      { name: 'prompt.md', path: 'prompt.md' },
    ],
    extendedFiles: [
      { name: 'prompt.md', path: 'prompt.md' },
      { name: 'onboarding/', path: 'onboarding/' },
      { name: 'nova-handoff.md', path: 'onboarding/nova-handoff.md', indent: 2 },
      { name: 'project-state.md', path: 'onboarding/project-state.md', indent: 2 },
      { name: 'architecture.md', path: 'onboarding/architecture.md', indent: 2 },
      { name: 'scratch/', path: 'scratch/' },
      { name: 'sprint-plan.md', path: 'scratch/sprint-plan.md', indent: 2 },
      { name: 'agent-assignments.md', path: 'scratch/agent-assignments.md', indent: 2 },
    ],
  },
  {
    slug: '001-architect',
    name: '001-architect',
    status: 'done',
    label: 'done',
    artifacts: [
      { name: 'onboarding/', path: 'onboarding/' },
      { name: 'scratch/', path: 'scratch/' },
    ],
    extendedFiles: [
      { name: 'onboarding/', path: 'onboarding/' },
      { name: '01-vision.md', path: 'onboarding/01-vision.md', indent: 2 },
      { name: '02-pipeline.md', path: 'onboarding/02-pipeline.md', indent: 2 },
      { name: 'scratch/', path: 'scratch/' },
      { name: 'foundation-checklist.md', path: 'scratch/foundation-checklist.md', indent: 2 },
    ],
  },
];

// ── Napkins ──

export const MOCK_NAPKINS: MockNapkin[] = [
  {
    slug: '0010-project-bootstrap',
    name: '0010-project-bootstrap',
    phase: 'done',
    artifacts: [
      { name: 'nap.md', path: '0010-project-bootstrap.nap.md' },
      { name: 'scaffold.md', path: 'scaffold.md' },
    ],
    agents: [{ name: '001-fs-eng', status: 'exit' }],
  },
  {
    slug: '0020-pty-terminal',
    name: '0020-pty-terminal',
    phase: 'done',
    artifacts: [
      { name: 'nap.md', path: '0020-pty-terminal.nap.md' },
      { name: 'spec.md', path: '0020-pty-terminal.spec.md' },
    ],
    agents: [{ name: '001-fs-eng', status: 'exit' }],
  },
  {
    slug: '0030-socket-server',
    name: '0030-socket-server',
    phase: 'done',
    artifacts: [
      { name: 'nap.md', path: '0030-socket-server.nap.md' },
      { name: 'spec.md', path: '0030-socket-server.spec.md' },
      { name: 'test.md', path: '0030-socket-server.test.md' },
    ],
    agents: [{ name: '001-fs-eng', status: 'exit' }],
  },
  {
    slug: '0040-cli-commands',
    name: '0040-cli-commands',
    phase: 'done',
    artifacts: [
      { name: 'nap.md', path: '0040-cli-commands.nap.md' },
      { name: 'spec.md', path: '0040-cli-commands.spec.md' },
    ],
    agents: [{ name: '001-fs-eng', status: 'exit' }],
  },
  {
    slug: '0050-basic-sidebar',
    name: '0050-basic-sidebar',
    phase: 'done',
    artifacts: [
      { name: 'nap.md', path: '0050-basic-sidebar.nap.md' },
    ],
    agents: [{ name: '001-fs-eng', status: 'exit' }],
  },
  {
    slug: '0100-design-sprint',
    name: '0100-design-sprint',
    phase: 'review',
    artifacts: [
      { name: 'nap.md', path: '0100-design-sprint.nap.md' },
      { name: 'spec.md', path: '0100-design-sprint.spec.md' },
      { name: 'test.md', path: '0100-design-sprint.test.md' },
    ],
    agents: [
      { name: '001-test-architect', status: 'done' },
      { name: '002-fs-eng', status: 'run' },
      { name: '003-test-eng', status: 'nap' },
    ],
  },
  {
    slug: '0200-sqlite-persistence',
    name: '0200-sqlite-persistence',
    phase: 'doing',
    artifacts: [
      { name: 'nap.md', path: '0200-sqlite-persistence.nap.md' },
      { name: 'spec.md', path: '0200-sqlite-persistence.spec.md' },
    ],
    agents: [
      { name: '001-fs-eng', status: 'run' },
      { name: '002-test-eng', status: 'nap' },
    ],
  },
  {
    slug: '0210-napkin-browser',
    name: '0210-napkin-browser',
    phase: 'doing',
    artifacts: [
      { name: 'nap.md', path: '0210-napkin-browser.nap.md' },
      { name: 'spec.md', path: '0210-napkin-browser.spec.md' },
    ],
    agents: [
      { name: '001-fs-eng', status: 'run' },
      { name: '002-test-eng', status: 'nap' },
    ],
  },
];

// ── Helpers ──

const STATUS_PHASE_COLORS: Record<NapkinPhase, string> = {
  done: '#6b7280',
  review: '#3b82f6',
  doing: '#22c55e',
  todo: '#6b7280',
  backlog: '#6b7280',
};

export function phaseColor(phase: NapkinPhase): string {
  return STATUS_PHASE_COLORS[phase];
}

const DOT_COLORS: Record<AgentStatus, string> = {
  run: '#22c55e',
  done: '#3b82f6',
  nap: '#f59e0b',
  exit: '#6b7280',
};

export function dotColor(status: AgentStatus): string {
  return DOT_COLORS[status];
}

// Whether the dot should be hollow (border only) vs filled
export function isDotHollow(status: AgentStatus): boolean {
  return status === 'nap' || status === 'exit';
}

// Whether the dot should pulse
export function isDotPulsing(status: AgentStatus): boolean {
  return status === 'run';
}
