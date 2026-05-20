import { describe, it, expect, beforeEach } from 'vitest';
import {
  PROVIDERS,
  buildCloneUrl,
  parseNapHash,
  buildNapConfig,
  parsePageUrl,
  deriveStateKey,
  getTokenForProvider,
} from '../url-config';
import { createNapStore, _resetTabIdCounter, type NapStoreApi } from '../store';
import { createMemoryStorage } from '../state-store';

// ── GL-S01: Provider registry mapping ──

describe('GL-S01: Provider registry mapping', () => {
  it('github resolves to github.com', () => {
    expect(PROVIDERS.github).toEqual({ hostname: 'github.com', label: 'GitHub' });
  });

  it('gitlab resolves to gitlab.grammarly.io', () => {
    expect(PROVIDERS.gitlab).toEqual({ hostname: 'gitlab.grammarly.io', label: 'GitLab' });
  });

  it('unknown key is not in registry', () => {
    expect(PROVIDERS['bitbucket']).toBeUndefined();
  });
});

// ── GL-S02: Clone URL construction with registry ──

describe('GL-S02: Clone URL with registry', () => {
  it('builds GitHub clone URL', () => {
    expect(buildCloneUrl('github', 'diunko', 'nap-test-nap'))
      .toBe('https://github.com/diunko/nap-test-nap');
  });

  it('builds GitLab clone URL with grammarly hostname', () => {
    expect(buildCloneUrl('gitlab', 'dmitry.unkovsky', 'nap-test-nap'))
      .toBe('https://gitlab.grammarly.io/dmitry.unkovsky/nap-test-nap');
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
  it('GitLab hash produces config with correct cloneUrl and provider', () => {
    const page = parsePageUrl('/diunko/nap-test-main/pull/1');
    const hash = parseNapHash('#nap-repo=gitlab/dmitry.unkovsky/nap-test-nap&napkin=01-v1/0100-delivery-pipeline')!;
    const config = buildNapConfig(page, hash);
    expect(config.provider).toBe('gitlab');
    expect(config.cloneUrl).toBe('https://gitlab.grammarly.io/dmitry.unkovsky/nap-test-nap');
    expect(config.napkinFocus).toBe('0100-delivery-pipeline');
    expect(config.mainOwner).toBe('diunko');
  });

  it('GitHub hash produces config with github provider', () => {
    const page = parsePageUrl('/diunko/nap-test-main/pull/1');
    const hash = parseNapHash('#nap-repo=github/diunko/nap-test-nap')!;
    const config = buildNapConfig(page, hash);
    expect(config.provider).toBe('github');
    expect(config.cloneUrl).toBe('https://github.com/diunko/nap-test-nap');
  });
});

// ── GL-S06: Two tokens, independent persistence ──

describe('GL-S06: Two tokens, independent persistence', () => {
  let store: NapStoreApi;

  beforeEach(() => {
    _resetTabIdCounter();
    store = createNapStore();
  });

  it('set githubToken → gitlabToken stays empty', () => {
    store.getState().setGithubToken('ghp_abc');
    expect(store.getState().githubToken).toBe('ghp_abc');
    expect(store.getState().gitlabToken).toBe('');
  });

  it('set gitlabToken → githubToken unchanged', () => {
    store.getState().setGithubToken('ghp_abc');
    store.getState().setGitlabToken('glpat-xyz');
    expect(store.getState().githubToken).toBe('ghp_abc');
    expect(store.getState().gitlabToken).toBe('glpat-xyz');
  });

  it('clear githubToken → gitlabToken still there', () => {
    store.getState().setGithubToken('ghp_abc');
    store.getState().setGitlabToken('glpat-xyz');
    store.getState().setGithubToken('');
    expect(store.getState().githubToken).toBe('');
    expect(store.getState().gitlabToken).toBe('glpat-xyz');
  });

  it('persist → rehydrate → both tokens intact', async () => {
    const storage = createMemoryStorage();
    const store1 = createNapStore('gl-test', storage);

    // Wait for hydration
    await new Promise<void>((resolve) => {
      const persist = (store1 as any).persist;
      if (persist?.hasHydrated?.()) resolve();
      else persist?.onFinishHydration?.(resolve);
    });

    store1.getState().setGithubToken('ghp_abc');
    store1.getState().setGitlabToken('glpat-xyz');

    // Wait for persist to flush
    await new Promise((r) => setTimeout(r, 50));

    // Create new store with same key — simulates reopen
    const store2 = createNapStore('gl-test', storage);
    await new Promise<void>((resolve) => {
      const persist = (store2 as any).persist;
      if (persist?.hasHydrated?.()) resolve();
      else persist?.onFinishHydration?.(resolve);
    });

    expect(store2.getState().githubToken).toBe('ghp_abc');
    expect(store2.getState().gitlabToken).toBe('glpat-xyz');
  });
});
