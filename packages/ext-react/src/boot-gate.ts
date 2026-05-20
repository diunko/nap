/**
 * Boot gate — pure decision logic for panel boot state.
 *
 * Reads the tab URL and decides: session, no-hash message, or wrong-page message.
 * No browser APIs — just string parsing.
 */

import {
  parseNapHash,
  parsePageUrl,
  deriveStateKey,
  buildNapConfig,
  type NapConfig,
} from './url-config';

export type BootState =
  | { state: 'session'; config: NapConfig; key: string }
  | { state: 'no-hash' }
  | { state: 'wrong-page' };

/**
 * Resolve boot state from a tab URL.
 *
 * - github.com + nap hash → session (config + key)
 * - github.com + no hash → no-hash (ask author for review link)
 * - not github.com / empty / undefined → wrong-page (open on a GitHub page)
 */
export function resolveBootState(url?: string): BootState {
  if (!url) return { state: 'wrong-page' };

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { state: 'wrong-page' };
  }

  if (parsed.hostname !== 'github.com') {
    return { state: 'wrong-page' };
  }

  const hash = parsed.hash;
  const hashConfig = parseNapHash(hash);

  if (!hashConfig) {
    return { state: 'no-hash' };
  }

  const page = parsePageUrl(parsed.pathname);
  const key = deriveStateKey(page, hashConfig);
  const config = buildNapConfig(page, hashConfig);

  return { state: 'session', config, key };
}
