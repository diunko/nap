import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  PROVIDERS,
  buildCloneUrl,
  setGitlabHostname,
  parseNapHash,
  buildNapConfig,
  parsePageUrl,
  deriveStateKey,
  getTokenForProvider,
} from '../url-config';

// ── GL-S01: Provider registry mapping ──

describe('GL-S01: Provider registry mapping', () => {
  it('github resolves to github.com', () => {
    expect(PROVIDERS.github).toEqual({ hostname: 'github.com', label: 'GitHub' });
  });

  it('gitlab hostname starts empty (user-configured)', () => {
    // GitLab hostname comes from chrome.storage.sync, not hardcoded
    expect(PROVIDERS.gitlab.label).toBe('GitLab');
  });

  it('setGitlabHostname updates PROVIDERS', () => {
    setGitlabHostname('gitlab.example.com');
    expect(PROVIDERS.gitlab.hostname).toBe('gitlab.example.com');
    setGitlabHostname(''); // reset
  });

  it('unknown key is not in registry', () => {
    expect(PROVIDERS['bitbucket']).toBeUndefined();
  });
});

// ── GL-S02: Clone URL construction with registry ──

describe('GL-S02: Clone URL with registry', () => {
  beforeEach(() => setGitlabHostname('gitlab.grammarly.io'));
  afterEach(() => setGitlabHostname(''));

  it('builds GitHub clone URL', () => {
    expect(buildCloneUrl('github', 'diunko', 'nap-test-nap'))
      .toBe('https://github.com/diunko/nap-test-nap.git');
  });

  it('builds GitLab clone URL with configured hostname', () => {
    expect(buildCloneUrl('gitlab', 'dmitry.unkovsky', 'nap-test-nap'))
      .toBe('https://gitlab.grammarly.io/dmitry.unkovsky/nap-test-nap.git');
  });

  it('returns empty string when gitlab hostname not configured', () => {
    setGitlabHostname('');
    expect(buildCloneUrl('gitlab', 'org', 'repo')).toBe('');
  });

  it('unknown provider throws', () => {
    expect(() => buildCloneUrl('unknown', 'org', 'repo')).toThrow(/Unknown provider/);
  });

  it('error message lists known providers', () => {
    expect(() => buildCloneUrl('bitbucket', 'org', 'repo')).toThrow(/github, gitlab/);
  });
});

// ── GL-S03: Token selection by provider ──

describe('GL-S03: Token selection by provider', () => {
  const tokens = { githubToken: 'ghp_abc', gitlabToken: 'glpat-xyz' };

  it('provider github, both tokens set → returns githubToken', () => {
    const auth = getTokenForProvider('github', tokens);
    expect(auth).toEqual({ username: 'oauth2', password: 'ghp_abc' });
  });

  it('provider gitlab, both tokens set → returns gitlabToken', () => {
    const auth = getTokenForProvider('gitlab', tokens);
    expect(auth).toEqual({ username: 'oauth2', password: 'glpat-xyz' });
  });

  it('provider gitlab, only githubToken set → returns undefined', () => {
    const auth = getTokenForProvider('gitlab', { githubToken: 'ghp_abc' });
    expect(auth).toBeUndefined();
  });

  it('provider github, no tokens → returns undefined', () => {
    const auth = getTokenForProvider('github', {});
    expect(auth).toBeUndefined();
  });

  it('provider github, empty string token → returns undefined', () => {
    const auth = getTokenForProvider('github', { githubToken: '' });
    expect(auth).toBeUndefined();
  });

  it('unknown provider → returns undefined', () => {
    const auth = getTokenForProvider('bitbucket', tokens);
    expect(auth).toBeUndefined();
  });
});

// ── GL-S04: State-key isolation across providers ──

describe('GL-S04: State-key provider isolation', () => {
  it('same owner/repo on GitHub vs GitLab produces different state keys', () => {
    const page = parsePageUrl('/owner/repo/pull/1');
    const ghHash = parseNapHash('#nap-repo=github/org/nap')!;
    const glHash = parseNapHash('#nap-repo=gitlab/org/nap')!;
    const ghKey = deriveStateKey(page, ghHash);
    const glKey = deriveStateKey(page, glHash);
    expect(ghKey).not.toBe(glKey);
    expect(ghKey).toContain('/github/');
    expect(glKey).toContain('/gitlab/');
  });
});

// ── GL-S05: buildNapConfig with GitLab provider ──

describe('GL-S05: buildNapConfig with GitLab provider', () => {
  beforeEach(() => setGitlabHostname('gitlab.grammarly.io'));
  afterEach(() => setGitlabHostname(''));

  it('GitLab hash produces config with correct cloneUrl and provider', () => {
    const page = parsePageUrl('/diunko/nap-test-main/pull/1');
    const hash = parseNapHash('#nap-repo=gitlab/dmitry.unkovsky/nap-test-nap&napkin=01-v1/0100-delivery-pipeline')!;
    const config = buildNapConfig(page, hash);
    expect(config.provider).toBe('gitlab');
    expect(config.cloneUrl).toBe('https://gitlab.grammarly.io/dmitry.unkovsky/nap-test-nap.git');
    expect(config.napkinFocus).toBe('0100-delivery-pipeline');
    expect(config.mainOwner).toBe('diunko');
  });

  it('GitHub hash produces config with github provider', () => {
    const page = parsePageUrl('/diunko/nap-test-main/pull/1');
    const hash = parseNapHash('#nap-repo=github/diunko/nap-test-nap')!;
    const config = buildNapConfig(page, hash);
    expect(config.provider).toBe('github');
    expect(config.cloneUrl).toBe('https://github.com/diunko/nap-test-nap.git');
  });
});

// GL-S06: Two tokens — now in chrome.storage.sync (global, not per-session).
// Tests moved to fixes-01 test suite. See FX-S10..FX-S16.

import { globalTokens, _resetMemoryStore, setGlobalToken } from '../chrome-storage';

describe('GL-S06: Two tokens, independent global storage', () => {
  beforeEach(() => {
    _resetMemoryStore();
  });

  it('set githubToken → gitlabToken stays empty', async () => {
    await setGlobalToken('githubToken', 'ghp_abc');
    expect(globalTokens.githubToken).toBe('ghp_abc');
    expect(globalTokens.gitlabToken).toBe('');
  });

  it('set both tokens → both accessible', async () => {
    await setGlobalToken('githubToken', 'ghp_abc');
    await setGlobalToken('gitlabToken', 'glpat-xyz');
    expect(globalTokens.githubToken).toBe('ghp_abc');
    expect(globalTokens.gitlabToken).toBe('glpat-xyz');
  });

  it('clear githubToken → gitlabToken still there', async () => {
    await setGlobalToken('githubToken', 'ghp_abc');
    await setGlobalToken('gitlabToken', 'glpat-xyz');
    await setGlobalToken('githubToken', '');
    expect(globalTokens.githubToken).toBe('');
    expect(globalTokens.gitlabToken).toBe('glpat-xyz');
  });
});
