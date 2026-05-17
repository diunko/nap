/**
 * Link routing — classifies and resolves links clicked in Monaco content.
 * Copied from v3/src/renderer/routing-rules.ts (link portion) + NEW GitHub URL builder.
 */

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

/**
 * Classifies and resolves a link from Monaco content.
 *
 * Rules:
 *   1. https:// or http:// -> openExternal
 *   2. .md extension -> openDoc (resolve relative to source file)
 *   3. Everything else -> openCode (build GitHub blob URL for main code repo)
 */
export function routeLink(ctx: LinkContext, mainRepo?: MainRepoConfig): LinkResult {
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

  // Code link -> GitHub blob URL
  const githubUrl = buildGitHubUrl(parsed.path, parsed.line, mainRepo);
  console.log(`[link] code -> openCode url=${githubUrl}`);
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
