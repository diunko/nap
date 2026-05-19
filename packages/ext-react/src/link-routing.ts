/**
 * Link routing — classifies and resolves links clicked in Monaco content.
 * Copied from v3/src/renderer/routing-rules.ts (link portion) + GitHub URL builder.
 *
 * v0650: diff-aware routing — routes to diff URL or blob URL based on prDiffRanges.
 */

import { lineInRanges, buildDiffAnchor, type DiffRangeMap } from './pr-diff';

export interface LinkContext {
  href: string;
  sourceFilePath: string;
}

export type LinkResult =
  | { action: 'openCode'; githubUrl: string; line?: number }
  | { action: 'openDoc'; path: string }
  | { action: 'openExternal'; url: string };

export interface MainRepoConfig {
  owner: string;
  repo: string;
  branch: string;
}

export interface DiffRoutingContext {
  prNum: number;
  prDiffRanges: DiffRangeMap | null;
}

/**
 * Decide whether a file:line link should navigate to diff view or blob view.
 *
 * Returns 'diff' | 'blob'.
 */
export function routingDecision(
  filePath: string,
  line: number | undefined,
  diffCtx?: DiffRoutingContext,
): 'diff' | 'blob' {
  if (!diffCtx || diffCtx.prNum === 0 || !diffCtx.prDiffRanges) return 'blob';

  const ranges = diffCtx.prDiffRanges[filePath];
  if (!ranges || ranges.length === 0) return 'blob';

  if (line != null && lineInRanges(line, ranges)) return 'diff';

  // File is in diff but line is outside all hunks → blob
  return 'blob';
}

/**
 * Classifies and resolves a link from Monaco content.
 *
 * Rules:
 *   1. https:// or http:// -> openExternal
 *   2. .md extension -> openDoc (resolve relative to source file)
 *   3. Everything else -> openCode (diff URL or blob URL)
 */
export function routeLink(
  ctx: LinkContext,
  mainRepo?: MainRepoConfig,
  diffCtx?: DiffRoutingContext,
): LinkResult {
  const { href, sourceFilePath } = ctx;
  console.log(`[link] routing: href=${href} source=${sourceFilePath}`);

  if (href.startsWith('https://') || href.startsWith('http://')) {
    return { action: 'openExternal', url: href };
  }

  const parsed = parseLinkHref(href);
  const ext = getExtension(parsed.path);

  if (ext === '.md') {
    const resolved = resolveRelative(parsed.path, sourceFilePath);
    console.log(`[link] .md -> openDoc path=${resolved}`);
    return { action: 'openDoc', path: resolved };
  }

  // Code link — check diff-aware routing
  const cleanPath = parsed.path.startsWith('/') ? parsed.path.slice(1) : parsed.path;
  const decision = routingDecision(cleanPath, parsed.line, diffCtx);

  if (decision === 'diff' && diffCtx && mainRepo) {
    // Build diff URL — async, but we need sync return. Use pre-computed anchor.
    // For now, build synchronously and return a placeholder that will be resolved.
    const githubUrl = buildDiffUrl(mainRepo, diffCtx.prNum, cleanPath, parsed.line);
    console.log(`[link] code -> openCode (diff) url=${githubUrl}`);
    return { action: 'openCode', githubUrl, line: parsed.line };
  }

  const githubUrl = buildGitHubUrl(parsed.path, parsed.line, mainRepo);
  console.log(`[link] code -> openCode (blob) url=${githubUrl}`);
  return { action: 'openCode', githubUrl, line: parsed.line };
}

/**
 * Parse line anchor or :line suffix from an href.
 */
export function parseLinkHref(href: string): { path: string; line?: number } {
  const anchorMatch = href.match(/^(.+?)#L(\d+)$/);
  if (anchorMatch) {
    return { path: anchorMatch[1], line: parseInt(anchorMatch[2], 10) };
  }

  const lineMatch = href.match(/^(.+?):(\d+)$/);
  if (lineMatch) {
    return { path: lineMatch[1], line: parseInt(lineMatch[2], 10) };
  }

  return { path: href };
}

/**
 * Build a GitHub blob URL for a file:line in the MAIN CODE REPO (not the .nap repo).
 */
export function buildGitHubUrl(
  path: string,
  line: number | undefined,
  config?: MainRepoConfig,
): string {
  const owner = config?.owner ?? 'OWNER';
  const repo = config?.repo ?? 'REPO';
  const branch = config?.branch ?? 'main';

  // Strip leading slash
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  let url = `https://github.com/${owner}/${repo}/blob/${branch}/${cleanPath}`;
  if (line != null) url += `#L${line}`;
  return url;
}

/**
 * Build a GitHub diff URL for a file:line in a PR.
 * Uses pre-computed SHA256 anchor.
 *
 * Note: The SHA256 is computed async, so this builds a URL with a synchronous
 * placeholder. ContentPane will resolve the final URL asynchronously.
 */
export function buildDiffUrl(
  config: MainRepoConfig,
  prNum: number,
  filePath: string,
  line?: number,
): string {
  // We store a marker that ContentPane will resolve async
  const lineFragment = line != null ? `R${line}` : '';
  return `__DIFF_URL__:${config.owner}/${config.repo}/pull/${prNum}/files:${filePath}:${lineFragment}`;
}

/**
 * Resolve a diff URL placeholder to the real GitHub URL.
 * Called asynchronously by the link click handler.
 */
export async function resolveDiffUrl(placeholder: string): Promise<string> {
  if (!placeholder.startsWith('__DIFF_URL__:')) return placeholder;

  const parts = placeholder.slice('__DIFF_URL__:'.length).split(':');
  const prPath = parts[0]; // owner/repo/pull/N/files
  const filePath = parts[1];
  const lineFragment = parts[2] || '';

  const anchor = await buildDiffAnchor(filePath, lineFragment ? parseInt(lineFragment.slice(1), 10) : 0);
  // If no line, use just the diff anchor without line reference
  const finalAnchor = lineFragment ? anchor : `#diff-${anchor.split('#diff-')[1]?.split('R')[0] || ''}`;

  return `https://github.com/${prPath}${anchor}`;
}

function getExtension(p: string): string {
  const lastDot = p.lastIndexOf('.');
  if (lastDot <= 0) return '';
  const lastSlash = p.lastIndexOf('/');
  if (lastDot < lastSlash) return '';
  return p.slice(lastDot);
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
