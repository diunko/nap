/**
 * Chrome storage helpers for global state.
 *
 * Tokens and debug mode live in chrome.storage.sync — global, not per-session.
 * Falls back to in-memory storage when chrome.storage is unavailable (vitest).
 */

export interface GlobalSettings {
  githubToken: string;
  gitlabToken: string;
  debugMode: boolean;
}

const DEFAULTS: GlobalSettings = {
  githubToken: '',
  gitlabToken: '',
  debugMode: false,
};

// ── In-memory fallback (vitest, dev mode without chrome API) ──

let memoryStore: GlobalSettings = { ...DEFAULTS };

function hasChromeStorage(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.storage?.sync;
}

/** Read global settings from chrome.storage.sync. */
export function readGlobalSettings(): Promise<GlobalSettings> {
  if (!hasChromeStorage()) {
    return Promise.resolve({ ...memoryStore });
  }
  return new Promise((resolve) => {
    chrome.storage.sync.get(
      ['githubToken', 'gitlabToken', 'debugMode'],
      (result) => {
        resolve({
          githubToken: result.githubToken ?? DEFAULTS.githubToken,
          gitlabToken: result.gitlabToken ?? DEFAULTS.gitlabToken,
          debugMode: result.debugMode ?? DEFAULTS.debugMode,
        });
      },
    );
  });
}

/** Write one or more global settings to chrome.storage.sync. */
export function writeGlobalSettings(partial: Partial<GlobalSettings>): Promise<void> {
  if (!hasChromeStorage()) {
    Object.assign(memoryStore, partial);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    chrome.storage.sync.set(partial, () => resolve());
  });
}

// ── Global tokens ref (in-memory, updated from chrome.storage.sync) ──
// Pipeline steps and Panel getAuth read from this ref.
// Settings UI and inline token form write to both chrome.storage.sync and this ref.

export const globalTokens = {
  githubToken: '',
  gitlabToken: '',
};

/** Initialize tokens from chrome.storage.sync. Call once at boot. */
export async function initGlobalTokens(): Promise<void> {
  const settings = await readGlobalSettings();
  globalTokens.githubToken = settings.githubToken;
  globalTokens.gitlabToken = settings.gitlabToken;
}

/** Update a token in both chrome.storage.sync and the in-memory ref. */
export async function setGlobalToken(
  key: 'githubToken' | 'gitlabToken',
  value: string,
): Promise<void> {
  globalTokens[key] = value;
  await writeGlobalSettings({ [key]: value });
}

// ── Debug mode ref ──

export let globalDebugMode = false;

export async function initGlobalDebugMode(): Promise<void> {
  const settings = await readGlobalSettings();
  globalDebugMode = settings.debugMode;
}

export async function setGlobalDebugMode(value: boolean): Promise<void> {
  globalDebugMode = value;
  await writeGlobalSettings({ debugMode: value });
}

// ── Test helper (vitest) ──

export function _resetMemoryStore(): void {
  memoryStore = { ...DEFAULTS };
  globalTokens.githubToken = '';
  globalTokens.gitlabToken = '';
  globalDebugMode = false;
}
