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

// ── Link routing — classifies and resolves links clicked in Monaco content ──

export interface LinkContext {
  href: string;
  sourceFilePath: string;
}

export type LinkResult =
  | { action: 'openCode'; path: string; fallbackPath?: string; line?: number; col?: number }
  | { action: 'openDoc'; path: string }
  | { action: 'openExternal'; url: string };

/**
 * Classifies and resolves a link from Monaco content.
 *
 * Rules:
 *   1. https:// or http:// → openExternal
 *   2. .md extension → openDoc (resolve relative to source file)
 *   3. Everything else → openCode
 *
 * Path resolution for code links:
 *   - Leading `/` → project root + path
 *   - `./` or `../` → dirname(sourceFile) + path
 *   - Bare path → dirname(sourceFile) + path (primary), project root + path (fallback)
 *
 * Extension wins over :line suffix. `changelog.md:15` → openDoc (strip the :15).
 */
export function routeLink(ctx: LinkContext): LinkResult {
  const { href, sourceFilePath } = ctx;

  // External links
  if (href.startsWith('https://') || href.startsWith('http://')) {
    return { action: 'openExternal', url: href };
  }

  // Parse line:col or #L anchor from href
  const parsed = parseLinkHref(href);

  // Classification by extension — extension wins
  const ext = getExtension(parsed.path);
  if (ext === '.md') {
    const resolved = resolveRelative(parsed.path, sourceFilePath);
    return { action: 'openDoc', path: resolved };
  }

  // Everything else → openCode
  const projectRoot = extractProjectRoot(sourceFilePath);

  if (parsed.path.startsWith('/')) {
    if (sourceFilePath) {
      // Absolute → project root relative (in-content links where / means project root)
      const resolved = normalizePath(projectRoot + parsed.path);
      return { action: 'openCode', path: resolved, line: parsed.line, col: parsed.col };
    }
    // No source context (terminal links) — path is already fully resolved
    return { action: 'openCode', path: parsed.path, line: parsed.line, col: parsed.col };
  }

  if (parsed.path.startsWith('./') || parsed.path.startsWith('../')) {
    // Explicit relative → dirname(source)
    const resolved = resolveRelative(parsed.path, sourceFilePath);
    return { action: 'openCode', path: resolved, line: parsed.line, col: parsed.col };
  }

  // Bare path → primary = dirname, fallback = projectRoot
  const primary = resolveRelative(parsed.path, sourceFilePath);
  const fallback = normalizePath(projectRoot + '/' + parsed.path);
  return {
    action: 'openCode',
    path: primary,
    fallbackPath: primary !== fallback ? fallback : undefined,
    line: parsed.line,
    col: parsed.col,
  };
}

// ── Link routing helpers ──

export function parseLinkHref(href: string): { path: string; line?: number; col?: number } {
  // Handle #L42 anchor style (markdown links)
  const anchorMatch = href.match(/^(.+?)#L(\d+)$/);
  if (anchorMatch) {
    return { path: anchorMatch[1], line: parseInt(anchorMatch[2], 10) };
  }

  // Handle :line or :line:col style
  const lineColMatch = href.match(/^(.+?):(\d+)(?::(\d+))?$/);
  if (lineColMatch) {
    return {
      path: lineColMatch[1],
      line: parseInt(lineColMatch[2], 10),
      col: lineColMatch[3] ? parseInt(lineColMatch[3], 10) : undefined,
    };
  }

  return { path: href };
}

function getExtension(p: string): string {
  const lastDot = p.lastIndexOf('.');
  if (lastDot <= 0) return '';
  const lastSlash = p.lastIndexOf('/');
  if (lastDot < lastSlash) return '';
  return p.slice(lastDot);
}

/** Extract project root from a source file path (parent of .nap/). */
export function extractProjectRoot(sourceFilePath: string): string {
  const napIdx = sourceFilePath.indexOf('/.nap/');
  if (napIdx !== -1) return sourceFilePath.slice(0, napIdx);
  if (sourceFilePath.startsWith('.nap/')) return '.';
  const segments = sourceFilePath.split('/');
  const napSegIdx = segments.indexOf('.nap');
  if (napSegIdx > 0) return segments.slice(0, napSegIdx).join('/');
  if (napSegIdx === 0) return '.';
  return getDirname(sourceFilePath);
}

function getDirname(p: string): string {
  const lastSlash = p.lastIndexOf('/');
  return lastSlash > 0 ? p.slice(0, lastSlash) : lastSlash === 0 ? '/' : '.';
}

function resolveRelative(href: string, sourceFilePath: string): string {
  const dir = getDirname(sourceFilePath);
  if (href.startsWith('/')) return normalizePath(href);
  const combined = dir === '.' ? href : dir + '/' + href;
  return normalizePath(combined);
}

function normalizePath(p: string): string {
  const parts = p.split('/');
  const result: string[] = [];
  for (const part of parts) {
    if (part === '.') continue;
    if (part === '') {
      if (result.length === 0) result.push('');
      continue;
    }
    if (part === '..') {
      if (result.length > 1 || (result.length === 1 && result[0] !== '')) {
        result.pop();
      }
      continue;
    }
    result.push(part);
  }
  return result.join('/') || '.';
}
