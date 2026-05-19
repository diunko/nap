/**
 * Session — ties a state key to an isolated LFS + store + model.
 *
 * One key = one session = one filesystem + one UI state + one model.
 * Different keys = completely independent. No cross-contamination.
 */
import { createContext, useContext } from 'react';
import { useStore } from 'zustand';
import LightningFS from '@isomorphic-git/lightning-fs';
import { LightningFsAdapter } from './fs-adapter';
import { createNapStore, type NapStore, type NapStoreApi } from './store';
import { createModel, type NapModel } from './model';
import { idbStorage } from './state-store';

export interface Session {
  key: string;
  lfs: InstanceType<typeof LightningFS>;
  adapter: LightningFsAdapter;
  store: NapStoreApi;
  model: NapModel;
}

/**
 * Create an isolated session. Everything is keyed:
 * - LFS database: `nap-fs-${key}`
 * - UI state: `nap-ui-${key}` in IndexedDB 'nap-state'
 */
export function createSession(key: string): Session {
  const lfs = new LightningFS(`nap-fs-${key}`);
  const adapter = new LightningFsAdapter(lfs);
  const store = createNapStore(key, idbStorage);
  const model = createModel({ adapter, store });

  // Expose for Playwright tests
  if (typeof window !== 'undefined') {
    (window as any).__napStore__ = store;
  }

  console.log(`[session] created: key=${key}, lfs=nap-fs-${key}, ui=nap-ui-${key}`);
  return { key, lfs, adapter, store, model };
}

/** Get the state key. Default for now, URL hash parsing in napkin 0400. */
export function getStateKey(): string {
  return 'default';
}

// ── React context ──

export const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession must be used within SessionContext.Provider');
  return session;
}

/** Convenience hook — same API as the old `useNapStore(selector)` but reads from session. */
export function useNapStore<T>(selector: (s: NapStore) => T): T {
  const { store } = useSession();
  return useStore(store, selector);
}
