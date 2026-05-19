/**
 * Agent dot styling — pure function mapping role × status to color + shape.
 * Ported from v3/src/shared/dot-style.ts.
 */

export interface DotInput {
  role: string;
  running: boolean;
  done: boolean;
  exited: boolean;
  archived?: boolean;
}

export interface DotStyle {
  color: string;
  shape: 'filled' | 'dashed-check' | 'hollow';
}

const ROLE_COLORS: Record<string, string> = {
  'test-arch': '#f59e0b',
  'fs-eng': '#22c55e',
  'test-eng': '#6b7280',
  'architect': '#3b82f6',
  'guardian': '#a855f7',
};

const GRAY = '#6b7280';
const DEFAULT_COLOR = '#3b82f6';

export function getDotStyle(input: DotInput): DotStyle {
  const roleColor = ROLE_COLORS[input.role] ?? DEFAULT_COLOR;

  if (input.archived) {
    return { color: GRAY, shape: 'hollow' };
  }

  if (input.exited && !input.done) {
    return { color: GRAY, shape: 'hollow' };
  }

  if (input.done) {
    return { color: roleColor, shape: 'dashed-check' };
  }

  return { color: roleColor, shape: 'filled' };
}

/** Role color for comment prefix highlighting (//DU:, //A:, //TA:, //TE:). */
export function getRoleColor(role: string): string {
  return ROLE_COLORS[role] ?? DEFAULT_COLOR;
}

/** Phase status color. */
export function getPhaseColor(status: string): string {
  if (status === 'doing') return '#22c55e';
  if (status === 'done') return '#22c55e';
  return '#525252'; // backlog, etc.
}
