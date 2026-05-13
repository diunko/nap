// ── Routing rules — pure function, no store or React imports ──
//
// Takes click context from sidebar, returns which pane and surface to use.
// Keep this simple — a sequence of if/else, no abstractions.

export interface ClickContext {
  filePath?: string;
  agent?: { id: string; started: boolean };
}

export interface RouteResult {
  pane: 'left' | 'right';
  surface: 'monaco' | 'terminal';
}

/**
 * Determines where a sidebar click should route.
 *
 * Rules:
 *   1. Agent click (has agent.id) → right pane, terminal
 *   2. File inside .nap/ directory → left pane, Monaco
 *   3. Fallback → right pane, terminal
 *
 * Path matching uses path segments (/.nap/) not substring includes.
 */
export function route(ctx: ClickContext): RouteResult {
  // Agent click → right pane, terminal
  if (ctx.agent) {
    return { pane: 'right', surface: 'terminal' };
  }

  // File inside .nap/ → left pane, Monaco
  if (ctx.filePath && isNapPath(ctx.filePath)) {
    return { pane: 'left', surface: 'monaco' };
  }

  // Fallback → right pane
  return { pane: 'right', surface: 'terminal' };
}

/** Check if a path has .nap as a directory segment (not just a substring). */
function isNapPath(filePath: string): boolean {
  const segments = filePath.split('/');
  return segments.some((seg) => seg === '.nap');
}
