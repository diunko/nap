import { describe, it, expect } from 'vitest';
import {
  parseNapHash,
  parsePageUrl,
  deriveStateKey,
  buildCloneUrl,
  napkinSlug,
  buildNapConfig,
} from '../url-config';

// ── WW-S01: URL hash parsing ──

describe('WW-S01: parseNapHash', () => {
  it('parses full hash with all fields', () => {
    const hash = '#nap-repo=github/org/repo&nap-branch=dev&napkin=01-v1/0100-feature';
    const result = parseNapHash(hash);
    expect(result).toEqual({
      provider: 'github',
      napOwner: 'org',
      napRepo: 'repo',
      napBranch: 'dev',
      napkin: '01-v1/0100-feature',
    });
  });

  it('defaults napBranch to main when missing', () => {
    const result = parseNapHash('#nap-repo=github/org/repo');
    expect(result).not.toBeNull();
    expect(result!.napBranch).toBe('main');
    expect(result!.napkin).toBeNull();
  });

  it('parses gitlab provider', () => {
    const result = parseNapHash('#nap-repo=gitlab/org/repo');
    expect(result).not.toBeNull();
    expect(result!.provider).toBe('gitlab');
  });

  it('returns null for empty hash', () => {
    expect(parseNapHash('')).toBeNull();
  });

  it('returns null for hash without nap-repo', () => {
    expect(parseNapHash('#foo=bar')).toBeNull();
  });

  it('returns null for nap-repo with fewer than 3 parts', () => {
    expect(parseNapHash('#nap-repo=github/org')).toBeNull();
  });

  it('handles URL-encoded values', () => {
    const hash = '#nap-repo=github/org/repo&napkin=01-v1/0100-delivery%20pipeline';
    const result = parseNapHash(hash);
    expect(result!.napkin).toBe('01-v1/0100-delivery pipeline');
  });

  it('handles hash without leading #', () => {
    const result = parseNapHash('nap-repo=github/org/repo');
    expect(result).not.toBeNull();
    expect(result!.provider).toBe('github');
  });
});

// ── WW-S02: State-key derivation ──

describe('WW-S02: deriveStateKey', () => {
  it('derives key for a PR page', () => {
    const page = parsePageUrl('/diunko/nap-test-main/pull/1');
    const hash = parseNapHash('#nap-repo=github/diunko/nap-test-nap&napkin=01-v1/0100-delivery-pipeline')!;
    const key = deriveStateKey(page, hash);
    expect(key).toBe('diunko/nap-test-main/1/github/diunko/nap-test-nap/main');
  });

  it('derives key for a non-PR page (prNum = 0)', () => {
    const page = parsePageUrl('/diunko/nap-test-main/blob/main/');
    expect(page.prNum).toBe(0);
    const hash = parseNapHash('#nap-repo=github/diunko/nap-test-nap')!;
    const key = deriveStateKey(page, hash);
    expect(key).toContain('/0/');
  });

  it('different PRs produce different keys', () => {
    const hash = parseNapHash('#nap-repo=github/diunko/nap-test-nap')!;
    const key1 = deriveStateKey(parsePageUrl('/owner/repo/pull/1'), hash);
    const key2 = deriveStateKey(parsePageUrl('/owner/repo/pull/2'), hash);
    expect(key1).not.toBe(key2);
  });

  it('same PR, different .nap repos produce different keys', () => {
    const page = parsePageUrl('/owner/repo/pull/1');
    const hash1 = parseNapHash('#nap-repo=github/org/napA')!;
    const hash2 = parseNapHash('#nap-repo=github/org/napB')!;
    const key1 = deriveStateKey(page, hash1);
    const key2 = deriveStateKey(page, hash2);
    expect(key1).not.toBe(key2);
  });

  it('same PR, same repo, different branches produce different keys', () => {
    const page = parsePageUrl('/owner/repo/pull/1');
    const hash1 = parseNapHash('#nap-repo=github/org/nap&nap-branch=main')!;
    const hash2 = parseNapHash('#nap-repo=github/org/nap&nap-branch=dev')!;
    const key1 = deriveStateKey(page, hash1);
    const key2 = deriveStateKey(page, hash2);
    expect(key1).not.toBe(key2);
  });

  it('extracts PR number from various GitHub URL shapes', () => {
    expect(parsePageUrl('/owner/repo/pull/42').prNum).toBe(42);
    expect(parsePageUrl('/owner/repo/pull/42/files').prNum).toBe(42);
    expect(parsePageUrl('/owner/repo/pull/42/commits').prNum).toBe(42);
    expect(parsePageUrl('/owner/repo/pull/42/checks').prNum).toBe(42);
  });
});

// ── WW-S03: Clone URL construction ──

describe('WW-S03: buildCloneUrl', () => {
  it('builds GitHub clone URL', () => {
    expect(buildCloneUrl('github', 'diunko', 'nap-test-nap'))
      .toBe('https://github.com/diunko/nap-test-nap.git');
  });

  it('builds GitLab clone URL with grammarly hostname', () => {
    expect(buildCloneUrl('gitlab', 'org', 'project'))
      .toBe('https://gitlab.grammarly.io/org/project.git');
  });

  it('unknown provider throws', () => {
    expect(() => buildCloneUrl('bitbucket', 'org', 'repo')).toThrow(/Unknown provider/);
  });
});

// ── napkinSlug ──

describe('napkinSlug', () => {
  it('extracts slug from nepic/napkin path', () => {
    expect(napkinSlug('01-v1/0100-delivery-pipeline')).toBe('0100-delivery-pipeline');
  });

  it('returns the string if no slash', () => {
    expect(napkinSlug('0100-feature')).toBe('0100-feature');
  });
});

// ── buildNapConfig ──

describe('buildNapConfig', () => {
  it('builds full config from page and hash', () => {
    const page = parsePageUrl('/diunko/nap-test-main/pull/1');
    const hash = parseNapHash('#nap-repo=github/diunko/nap-test-nap&napkin=01-v1/0100-delivery-pipeline')!;
    const config = buildNapConfig(page, hash, 'feature/delivery-v2');
    expect(config).toEqual({
      provider: 'github',
      cloneUrl: 'https://github.com/diunko/nap-test-nap.git',
      napBranch: 'main',
      napkinFocus: '0100-delivery-pipeline',
      mainOwner: 'diunko',
      mainRepo: 'nap-test-main',
      mainBranch: 'feature/delivery-v2',
      prNum: 1,
    });
  });

  it('defaults mainBranch to main', () => {
    const page = parsePageUrl('/org/repo/pull/5');
    const hash = parseNapHash('#nap-repo=github/org/nap')!;
    const config = buildNapConfig(page, hash);
    expect(config.mainBranch).toBe('main');
  });
});
