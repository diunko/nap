import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { fetchPrHeadBranch } from '../pr-diff';
import { buildGitHubUrl } from '../link-routing';
import { createNapStore, _resetTabIdCounter } from '../store';
import { createMemoryStorage } from '../state-store';

// ── Mock fetch ──

const originalFetch = globalThis.fetch;
let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  globalThis.fetch = mockFetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockResponse(body: any, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

// ── PB-S01..S11: fetchPrHeadBranch response parsing ──

describe('PB-S01..S11: fetchPrHeadBranch', () => {
  it('PB-S01: normal PR — returns head.ref', async () => {
    mockFetch.mockResolvedValue(mockResponse({ head: { ref: 'feature/delivery-v2' } }));
    const result = await fetchPrHeadBranch('org', 'repo', 42);
    expect(result).toBe('feature/delivery-v2');
  });

  it('PB-S02: slashed branch name', async () => {
    mockFetch.mockResolvedValue(mockResponse({ head: { ref: 'nap-pro/0100-restore-version' } }));
    const result = await fetchPrHeadBranch('coda', 'coda', 149187);
    expect(result).toBe('nap-pro/0100-restore-version');
  });

  it('PB-S03: deeply slashed branch', async () => {
    mockFetch.mockResolvedValue(mockResponse({ head: { ref: 'org/team/feature/sub-thing' } }));
    const result = await fetchPrHeadBranch('org', 'repo', 1);
    expect(result).toBe('org/team/feature/sub-thing');
  });

  it('PB-S04: closed PR — still returns head.ref', async () => {
    mockFetch.mockResolvedValue(mockResponse({ head: { ref: 'old-branch' }, state: 'closed' }));
    const result = await fetchPrHeadBranch('org', 'repo', 10);
    expect(result).toBe('old-branch');
  });

  it('PB-S05: 404 response — returns null', async () => {
    mockFetch.mockResolvedValue(mockResponse({}, 404));
    const result = await fetchPrHeadBranch('org', 'repo', 999);
    expect(result).toBeNull();
  });

  it('PB-S06: 403 response — returns null', async () => {
    mockFetch.mockResolvedValue(mockResponse({}, 403));
    const result = await fetchPrHeadBranch('org', 'repo', 42);
    expect(result).toBeNull();
  });

  it('PB-S07: network error — returns null', async () => {
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));
    const result = await fetchPrHeadBranch('org', 'repo', 42);
    expect(result).toBeNull();
  });

  it('PB-S08: malformed response — no head field', async () => {
    mockFetch.mockResolvedValue(mockResponse({ base: { ref: 'main' } }));
    const result = await fetchPrHeadBranch('org', 'repo', 42);
    expect(result).toBeNull();
  });

  it('PB-S09: empty ref — returns null', async () => {
    mockFetch.mockResolvedValue(mockResponse({ head: { ref: '' } }));
    const result = await fetchPrHeadBranch('org', 'repo', 42);
    expect(result).toBeNull();
  });

  it('PB-S10: with PAT — Authorization header sent', async () => {
    mockFetch.mockResolvedValue(mockResponse({ head: { ref: 'main' } }));
    await fetchPrHeadBranch('org', 'repo', 42, 'ghp_testtoken');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.headers['Authorization']).toBe('Bearer ghp_testtoken');
  });

  it('PB-S11: without PAT — no Authorization header', async () => {
    mockFetch.mockResolvedValue(mockResponse({ head: { ref: 'main' } }));
    await fetchPrHeadBranch('org', 'repo', 42);
    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.headers['Authorization']).toBeUndefined();
  });
});

// ── PB-S12..S14: mainBranch update in store ──

describe('PB-S12..S14: store mainBranch', () => {
  beforeEach(_resetTabIdCounter);

  it('PB-S12: setMainRepo updates branch', () => {
    const store = createNapStore();
    store.getState().setMainRepo({ owner: 'coda', repo: 'coda', branch: 'main' });
    expect(store.getState().mainRepoConfig?.branch).toBe('main');

    store.getState().setMainRepo({ owner: 'coda', repo: 'coda', branch: 'nap-pro/0100-restore-version' });
    expect(store.getState().mainRepoConfig?.branch).toBe('nap-pro/0100-restore-version');
  });

  it('PB-S13: mainBranch with slash persists and hydrates', async () => {
    const storage = createMemoryStorage();
    const store = createNapStore('pr-test', storage);
    await new Promise(r => setTimeout(r, 50));

    store.getState().setMainRepo({ owner: 'coda', repo: 'coda', branch: 'nap-pro/0100-restore-version' });
    await new Promise(r => setTimeout(r, 50));

    const store2 = createNapStore('pr-test', storage);
    await new Promise(r => setTimeout(r, 100));

    expect(store2.getState().mainRepoConfig?.branch).toBe('nap-pro/0100-restore-version');
  });

  it('PB-S14: deeply slashed branch persists correctly', async () => {
    const storage = createMemoryStorage();
    const store = createNapStore('pr-deep', storage);
    await new Promise(r => setTimeout(r, 50));

    store.getState().setMainRepo({ owner: 'org', repo: 'repo', branch: 'org/team/feature/sub' });
    await new Promise(r => setTimeout(r, 50));

    const store2 = createNapStore('pr-deep', storage);
    await new Promise(r => setTimeout(r, 100));

    expect(store2.getState().mainRepoConfig?.branch).toBe('org/team/feature/sub');
  });
});

// ── PB-S15..S16: buildGitHubUrl with updated branch ──

describe('PB-S15..S16: buildGitHubUrl with branch', () => {
  it('PB-S15: blob URL uses slashed branch from mainRepoConfig', () => {
    const url = buildGitHubUrl('/modules/code_store.ts', 5, {
      owner: 'coda', repo: 'coda', branch: 'nap-pro/0100-restore-version',
    });
    expect(url).toBe('https://github.com/coda/coda/blob/nap-pro/0100-restore-version/modules/code_store.ts#L5');
  });

  it('PB-S16: blob URL with SHA as branch', () => {
    const url = buildGitHubUrl('/src/index.ts', 10, {
      owner: 'org', repo: 'repo', branch: '0f222eae21cce4612a89fb8fa59ce00f9b78eeb0',
    });
    expect(url).toContain('/blob/0f222eae21cce4612a89fb8fa59ce00f9b78eeb0/src/index.ts#L10');
  });
});
