/**
 * IndexedDB key-value storage adapter for Zustand persist middleware.
 *
 * Single database 'nap-state', one object store 'kv'.
 * Each session key is a record: 'nap-ui-pr-42', 'nap-ui-default', etc.
 */

const DB_NAME = 'nap-state';
const STORE_NAME = 'kv';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const idbStorage = {
  getItem: async (name: string): Promise<string | null> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(name);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  },
  setItem: async (name: string, value: string): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const req = tx.objectStore(STORE_NAME).put(value, name);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },
  removeItem: async (name: string): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const req = tx.objectStore(STORE_NAME).delete(name);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },
};

/** List all keys in the state store. */
export async function listStateKeys(): Promise<string[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAllKeys();
    req.onsuccess = () => resolve(req.result.map(String));
    req.onerror = () => reject(req.error);
  });
}

/** Delete a specific state key. */
export async function deleteStateKey(name: string): Promise<void> {
  await idbStorage.removeItem(name);
}

/** In-memory storage for vitest (no IndexedDB). */
export function createMemoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: async (name: string) => data.get(name) ?? null,
    setItem: async (name: string, value: string) => { data.set(name, value); },
    removeItem: async (name: string) => { data.delete(name); },
    _data: data, // exposed for test assertions
  };
}
