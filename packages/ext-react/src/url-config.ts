/**
 * URL hash parsing and state-key derivation — pure functions, no browser APIs.
 *
 * Used by content.ts (content script) and vitest tests.
 *
 * Hash format:
 *   #nap-repo={provider}/{owner}/{repo}&nap-branch={branch}&napkin={nepic}/{napkin}
 *
 * State-key format:
 *   {mainOwner}/{mainRepo}/{prNum}/{napProvider}/{napOwner}/{napRepo}/{napBranch}
 */

export interface NapHashConfig {
  provider: string;
  napOwner: string;
  napRepo: string;
  napBranch: string;
  napkin: string | null;
}

export interface PageInfo {
  mainOwner: string;
  mainRepo: string;
  prNum: number;
}

export interface NapConfig {
  provider: string;
  cloneUrl: string;
  napBranch: string;
  napkinFocus: string | null;
  nepicSlug: string | null;
  mainOwner: string;
  mainRepo: string;
  mainBranch: string;
  prNum: number;
}

/** Provider registry — single source of truth for hostname mapping. */
export const PROVIDERS: Record<string, { hostname: string; label: string }> = {
  github: { hostname: 'github.com', label: 'GitHub' },
  gitlab: { hostname: 'gitlab.grammarly.io', label: 'GitLab' },
};

/**
 * Parse the URL hash fragment into a NapHashConfig.
 * Returns null if the hash doesn't contain nap-repo.
 */
export function parseNapHash(hash: string): NapHashConfig | null {
  if (!hash) return null;
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw.includes('nap-repo=')) return null;

  const params = new URLSearchParams(raw);
  const napRepoParam = params.get('nap-repo');
  if (!napRepoParam) return null;

  const parts = napRepoParam.split('/');
  if (parts.length < 3) return null;

  const napkin = params.get('napkin') || null;

  return {
    provider: parts[0],
    napOwner: parts[1],
    napRepo: parts.slice(2).join('/'), // handle repos with slashes
    napBranch: params.get('nap-branch') || 'main',
    napkin,
  };
}

/**
 * Extract main repo info from a GitHub pathname.
 * Handles: /owner/repo/pull/N, /owner/repo/pull/N/files, /owner/repo/blob/branch/, etc.
 */
export function parsePageUrl(pathname: string): PageInfo {
  const parts = pathname.split('/').filter(Boolean);
  const mainOwner = parts[0] || '';
  const mainRepo = parts[1] || '';

  let prNum = 0;
  const pullIdx = parts.indexOf('pull');
  if (pullIdx !== -1 && parts[pullIdx + 1]) {
    prNum = parseInt(parts[pullIdx + 1], 10) || 0;
  }

  return { mainOwner, mainRepo, prNum };
}

/**
 * Derive a deterministic state key from page info and hash config.
 * This key maps 1:1 to a session (own LFS, own store, own model).
 */
export function deriveStateKey(page: PageInfo, hash: NapHashConfig): string {
  return `${page.mainOwner}/${page.mainRepo}/${page.prNum}/${hash.provider}/${hash.napOwner}/${hash.napRepo}/${hash.napBranch}`;
}

/**
 * Build an HTTPS clone URL from provider/owner/repo.
 * Uses the provider registry — unknown provider throws.
 */
export function buildCloneUrl(provider: string, owner: string, repo: string): string {
  const entry = PROVIDERS[provider];
  if (!entry) throw new Error(`Unknown provider: "${provider}". Known providers: ${Object.keys(PROVIDERS).join(', ')}`);
  return `https://${entry.hostname}/${owner}/${repo}.git`;
}

/**
 * Select the right auth token based on provider key.
 * Returns { username, password } for isomorphic-git onAuth, or undefined if no token.
 */
export function getTokenForProvider(
  provider: string,
  tokens: { githubToken?: string; gitlabToken?: string },
): { username: string; password: string } | undefined {
  const tokenMap: Record<string, string | undefined> = {
    github: tokens.githubToken,
    gitlab: tokens.gitlabToken,
  };
  const token = tokenMap[provider];
  if (!token) return undefined;
  return { username: 'oauth2', password: token };
}

/**
 * Extract the napkin slug (last path segment) from a napkin path.
 * e.g. "01-v1/0100-delivery-pipeline" → "0100-delivery-pipeline"
 */
export function napkinSlug(napkinPath: string): string {
  const parts = napkinPath.split('/');
  return parts[parts.length - 1];
}

/**
 * Extract the nepic slug (first path segment) from a napkin path.
 * e.g. "03-features/0330-state-persistence" → "03-features"
 * Returns null if the path has no slash (bare napkin slug with no nepic prefix).
 */
export function nepicSlug(napkinPath: string): string | null {
  const slashIdx = napkinPath.indexOf('/');
  if (slashIdx === -1) return null;
  return napkinPath.slice(0, slashIdx);
}

/**
 * Build the full NapConfig from page info and hash config.
 * mainBranch defaults to 'main' — content script can override from DOM.
 */
export function buildNapConfig(page: PageInfo, hash: NapHashConfig, mainBranch?: string): NapConfig {
  return {
    provider: hash.provider,
    cloneUrl: buildCloneUrl(hash.provider, hash.napOwner, hash.napRepo),
    napBranch: hash.napBranch,
    napkinFocus: hash.napkin ? napkinSlug(hash.napkin) : null,
    nepicSlug: hash.napkin ? nepicSlug(hash.napkin) : null,
    mainOwner: page.mainOwner,
    mainRepo: page.mainRepo,
    mainBranch: mainBranch || 'main',
    prNum: page.prNum,
  };
}
