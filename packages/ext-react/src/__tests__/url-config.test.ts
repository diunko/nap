import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  parseNapHash,
  parsePageUrl,
  deriveStateKey,
  buildCloneUrl,
  setGitlabHostname,
  napkinSlug,
  buildNapConfig,
} from '../url-config';
import { resolveBootState } from '../boot-gate';

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
  beforeEach(() => setGitlabHostname('gitlab.example.com'));
  afterEach(() => setGitlabHostname(''));

  it('builds GitHub clone URL', () => {
    expect(buildCloneUrl('github', 'diunko', 'nap-test-nap'))
      .toBe('https://github.com/diunko/nap-test-nap.git');
  });

  it('builds GitLab clone URL with configured hostname', () => {
    expect(buildCloneUrl('gitlab', 'org', 'project'))
      .toBe('https://gitlab.example.com/org/project.git');
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

// ── UF-S01..S18: parsePageUrl mainBranch extraction ──

describe('UF: parsePageUrl mainBranch', () => {
  it('UF-S01: bare repo URL → mainBranch defaults to main', () => {
    expect(parsePageUrl('/coda/coda')).toEqual({ mainOwner: 'coda', mainRepo: 'coda', prNum: 0, mainBranch: 'main' });
  });

  it('UF-S02: tree URL with branch name', () => {
    expect(parsePageUrl('/org/repo/tree/develop')).toEqual({ mainOwner: 'org', mainRepo: 'repo', prNum: 0, mainBranch: 'develop' });
  });

  it('UF-S03: tree URL with commit SHA', () => {
    expect(parsePageUrl('/coda/coda/tree/0f222eae21cce4612a89fb8fa59ce00f9b78eeb0')).toEqual({
      mainOwner: 'coda', mainRepo: 'coda', prNum: 0, mainBranch: '0f222eae21cce4612a89fb8fa59ce00f9b78eeb0',
    });
  });

  it('UF-S04: tree URL with nested path — only first segment is ref', () => {
    expect(parsePageUrl('/org/repo/tree/main/src/lib')).toEqual({ mainOwner: 'org', mainRepo: 'repo', prNum: 0, mainBranch: 'main' });
  });

  it('UF-S05: blob URL with branch', () => {
    expect(parsePageUrl('/org/repo/blob/feature-x/src/main.ts')).toEqual({ mainOwner: 'org', mainRepo: 'repo', prNum: 0, mainBranch: 'feature-x' });
  });

  it('UF-S06: blob URL with SHA', () => {
    expect(parsePageUrl('/org/repo/blob/abc123def456/src/index.ts')).toEqual({ mainOwner: 'org', mainRepo: 'repo', prNum: 0, mainBranch: 'abc123def456' });
  });

  it('UF-S07: PR URL → mainBranch defaults to main', () => {
    expect(parsePageUrl('/org/repo/pull/42')).toEqual({ mainOwner: 'org', mainRepo: 'repo', prNum: 42, mainBranch: 'main' });
  });

  it('UF-S08: PR files URL', () => {
    expect(parsePageUrl('/org/repo/pull/42/files')).toEqual({ mainOwner: 'org', mainRepo: 'repo', prNum: 42, mainBranch: 'main' });
  });

  it('UF-S09: PR commits URL', () => {
    expect(parsePageUrl('/org/repo/pull/42/commits')).toEqual({ mainOwner: 'org', mainRepo: 'repo', prNum: 42, mainBranch: 'main' });
  });

  it('UF-S10: PR specific commit', () => {
    expect(parsePageUrl('/org/repo/pull/42/commits/abc123')).toEqual({ mainOwner: 'org', mainRepo: 'repo', prNum: 42, mainBranch: 'main' });
  });

  it('UF-S11: issues URL — prNum must be 0, not the issue number', () => {
    expect(parsePageUrl('/org/repo/issues/123')).toEqual({ mainOwner: 'org', mainRepo: 'repo', prNum: 0, mainBranch: 'main' });
  });

  it('UF-S12: actions URL', () => {
    expect(parsePageUrl('/org/repo/actions')).toEqual({ mainOwner: 'org', mainRepo: 'repo', prNum: 0, mainBranch: 'main' });
  });

  it('UF-S13: wiki, settings, security — non-code pages', () => {
    for (const sub of ['wiki', 'settings', 'security']) {
      const p = parsePageUrl(`/org/repo/${sub}`);
      expect(p.prNum).toBe(0);
      expect(p.mainBranch).toBe('main');
    }
  });

  it('UF-S14: branch name with slash — takes first segment (known limitation)', () => {
    expect(parsePageUrl('/org/repo/tree/feature/my-branch')).toEqual({ mainOwner: 'org', mainRepo: 'repo', prNum: 0, mainBranch: 'feature' });
  });

  it('UF-S15: empty pathname', () => {
    expect(parsePageUrl('/')).toEqual({ mainOwner: '', mainRepo: '', prNum: 0, mainBranch: 'main' });
  });

  it('UF-S16: owner only, no repo', () => {
    expect(parsePageUrl('/coda')).toEqual({ mainOwner: 'coda', mainRepo: '', prNum: 0, mainBranch: 'main' });
  });

  it('UF-S17: tree URL with v-prefixed tag', () => {
    expect(parsePageUrl('/org/repo/tree/v2.1.0')).toEqual({ mainOwner: 'org', mainRepo: 'repo', prNum: 0, mainBranch: 'v2.1.0' });
  });

  it('UF-S18: blob URL with trailing slash', () => {
    expect(parsePageUrl('/org/repo/blob/main/')).toEqual({ mainOwner: 'org', mainRepo: 'repo', prNum: 0, mainBranch: 'main' });
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
      nepicSlug: '01-v1',
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

  it('extracts nepicSlug from napkin path with nepic prefix', () => {
    const page = parsePageUrl('/coda/coda/pull/148817');
    const hash = parseNapHash('#nap-repo=gitlab/dmitry.unkovsky/apps-napkins&napkin=03-features/0330-state-persistence')!;
    const config = buildNapConfig(page, hash);
    expect(config.napkinFocus).toBe('0330-state-persistence');
    expect(config.nepicSlug).toBe('03-features');
  });

  it('nepicSlug is null when no napkin in URL', () => {
    const page = parsePageUrl('/org/repo/pull/5');
    const hash = parseNapHash('#nap-repo=github/org/nap')!;
    const config = buildNapConfig(page, hash);
    expect(config.nepicSlug).toBeNull();
  });

  it('nepicSlug is null when napkin has no slash (bare slug)', () => {
    const page = parsePageUrl('/org/repo/pull/5');
    const hash = parseNapHash('#nap-repo=github/org/nap&napkin=0100-feature')!;
    const config = buildNapConfig(page, hash);
    expect(config.napkinFocus).toBe('0100-feature');
    expect(config.nepicSlug).toBeNull();
  });

  it('UF-S19: uses mainBranch from parsePageUrl (tree URL with SHA)', () => {
    const page = parsePageUrl('/coda/coda/tree/0f222eae21cce4612a89fb8fa59ce00f9b78eeb0');
    const hash = parseNapHash('#nap-repo=github/diunko/nap-test-nap')!;
    const config = buildNapConfig(page, hash);
    expect(config.mainBranch).toBe('0f222eae21cce4612a89fb8fa59ce00f9b78eeb0');
  });

  it('UF-S19b: uses mainBranch from parsePageUrl (tree URL with branch)', () => {
    const page = parsePageUrl('/org/repo/tree/develop');
    const hash = parseNapHash('#nap-repo=github/org/nap')!;
    const config = buildNapConfig(page, hash);
    expect(config.mainBranch).toBe('develop');
  });

  it('UF-S19c: override takes precedence over page.mainBranch', () => {
    const page = parsePageUrl('/org/repo/tree/develop');
    const hash = parseNapHash('#nap-repo=github/org/nap')!;
    const config = buildNapConfig(page, hash, 'feature/from-dom');
    expect(config.mainBranch).toBe('feature/from-dom');
  });
});

// ── UF-S20: resolveBootState end-to-end with tree URL ──

describe('UF-S20: resolveBootState mainBranch', () => {
  it('tree URL with SHA → config.mainBranch is the SHA', () => {
    const result = resolveBootState(
      'https://github.com/coda/coda/tree/0f222eae21cce4612a89fb8fa59ce00f9b78eeb0#nap-repo=github/diunko/nap-test-nap',
    );
    expect(result.state).toBe('session');
    if (result.state === 'session') {
      expect(result.config.mainBranch).toBe('0f222eae21cce4612a89fb8fa59ce00f9b78eeb0');
      expect(result.config.mainOwner).toBe('coda');
      expect(result.config.mainRepo).toBe('coda');
    }
  });

  it('blob URL with branch → config.mainBranch is the branch', () => {
    const result = resolveBootState(
      'https://github.com/org/repo/blob/develop/src/main.ts#nap-repo=github/org/nap',
    );
    expect(result.state).toBe('session');
    if (result.state === 'session') {
      expect(result.config.mainBranch).toBe('develop');
    }
  });

  it('bare repo URL → config.mainBranch defaults to main', () => {
    const result = resolveBootState(
      'https://github.com/org/repo#nap-repo=github/org/nap',
    );
    expect(result.state).toBe('session');
    if (result.state === 'session') {
      expect(result.config.mainBranch).toBe('main');
    }
  });

  it('PR URL → config.mainBranch defaults to main (branch from DOM later)', () => {
    const result = resolveBootState(
      'https://github.com/org/repo/pull/42#nap-repo=github/org/nap',
    );
    expect(result.state).toBe('session');
    if (result.state === 'session') {
      expect(result.config.mainBranch).toBe('main');
      expect(result.config.prNum).toBe(42);
    }
  });
});
