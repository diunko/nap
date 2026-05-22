import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { StateStorage } from 'zustand/middleware';
import type { NavNode } from './nav-tree';

export type CardViewMode = 'collapsed' | 'focused' | 'extended';

export interface Tab {
  id: string;
  path: string;
  type: 'file';
  ephemeral: boolean;
  scrollPos?: number;
  cursorPos?: { lineNumber: number; column: number };
}

export interface MainRepoConfig {
  owner: string;
  repo: string;
  branch: string;
}

export interface NapStore {
  // ── Nav state (from LFS parse) ──
  navSections: NavNode[];

  // ── UI state ──
  activeFilePath: string | null;
  focusedCardSlug: string | null;
  cardViewMode: CardViewMode;
  focusMode: boolean;
  sidebarVisible: boolean;
  activeSurface: 'editor' | 'terminal' | 'playground';

  // ── Tabs (single pane — no left/right split) ──
  tabs: Tab[];
  activeTabId: string | null;

  // ── Extension-specific ──
  mainRepoConfig: MainRepoConfig | null;
  zoom: number;
  settingsVisible: boolean;

  // ── Auth tokens ──
  githubToken: string;
  gitlabToken: string;

  // ── Workflow wiring ──
  prNum: number;
  prDiffRanges: Record<string, Array<{ start: number; end: number }>> | null;
  /** Transient — not persisted. Model sets this for Sidebar loading state. */
  cloningStatus: 'idle' | 'cloning' | 'done';

  // ── Actions ──
  openDoc: (path: string) => void;
  closeTab: (tabId: string) => void;
  closeActiveTab: () => void;
  pinTab: (tabId: string) => void;
  pinActiveEphemeral: () => void;
  saveTabScroll: (tabId: string, scrollPos: number, cursorPos?: Tab['cursorPos']) => void;
  expandCard: (slug: string) => void;
  extendCard: () => void;
  collapseCard: () => void;
  toggleFocusMode: () => void;
  toggleSidebar: () => void;
  setActiveSurface: (surface: 'editor' | 'terminal' | 'playground') => void;
  refreshNav: (sections: NavNode[]) => void;
  setMainRepo: (config: MainRepoConfig | null) => void;
  setZoom: (zoom: number) => void;
  toggleSettings: () => void;
  setPrNum: (n: number) => void;
  setPrDiffRanges: (ranges: Record<string, Array<{ start: number; end: number }>> | null) => void;
  setCloningStatus: (status: 'idle' | 'cloning' | 'done') => void;
  setGithubToken: (token: string) => void;
  setGitlabToken: (token: string) => void;
}

/** Fields persisted to IndexedDB. */
export type PersistedState = Pick<NapStore,
  'tabs' | 'activeTabId' | 'activeFilePath' | 'activeSurface' |
  'focusedCardSlug' | 'cardViewMode' | 'focusMode' | 'mainRepoConfig' | 'zoom' |
  'prNum' | 'prDiffRanges' | 'githubToken' | 'gitlabToken'
>;

let tabIdCounter = 0;
function nextTabId(): string {
  return `tab-${++tabIdCounter}`;
}

/** Reset counter (test-only). */
export function _resetTabIdCounter(): void {
  tabIdCounter = 0;
}

/** Find or create a tab for a path. Returns [updatedTabs, tabId]. */
export function upsertTab(
  tabs: Tab[],
  path: string,
  ephemeral: boolean,
): [Tab[], string] {
  const existing = tabs.find((t) => t.path === path);
  if (existing) return [tabs, existing.id];

  if (ephemeral) {
    const ephIdx = tabs.findIndex((t) => t.ephemeral);
    if (ephIdx !== -1) {
      const updated = [...tabs];
      updated[ephIdx] = { ...updated[ephIdx], path };
      return [updated, updated[ephIdx].id];
    }
  }

  const tab: Tab = { id: nextTabId(), path, type: 'file', ephemeral };
  return [[...tabs, tab], tab.id];
}

/** Remove a tab and pick the next active. */
export function removeTab(
  tabs: Tab[],
  tabId: string,
  activeId: string | null,
): [Tab[], string | null] {
  const idx = tabs.findIndex((t) => t.id === tabId);
  if (idx === -1) return [tabs, activeId];
  const newTabs = tabs.filter((t) => t.id !== tabId);
  if (newTabs.length === 0) return [newTabs, null];
  if (activeId !== tabId) return [newTabs, activeId];
  const nextIdx = Math.min(idx, newTabs.length - 1);
  return [newTabs, newTabs[nextIdx].id];
}

// ── Store actions (shared between factory variants) ──

function storeActions(set: any, get: any): NapStore {
  return {
    navSections: [],
    activeFilePath: null,
    focusedCardSlug: null,
    cardViewMode: 'collapsed' as CardViewMode,
    focusMode: true,
    sidebarVisible: true,
    activeSurface: 'editor' as const,
    tabs: [],
    activeTabId: null,
    mainRepoConfig: null,
    zoom: 1.0,
    settingsVisible: false,
    prNum: 0,
    prDiffRanges: null,
    githubToken: '',
    gitlabToken: '',
    cloningStatus: 'idle' as const,

    openDoc: (path: string) => {
      console.log(`[store] openDoc ${path}`);
      const prev = get();
      const [tabs, tabId] = upsertTab(prev.tabs, path, true);
      console.log(`[store] openDoc → upsertTab → activeFilePath=${path}`);
      set({ activeFilePath: path, tabs, activeTabId: tabId, activeSurface: 'editor' });
    },

    closeTab: (tabId: string) => {
      console.log(`[store] closeTab ${tabId}`);
      const prev = get();
      const [tabs, nextActive] = removeTab(prev.tabs, tabId, prev.activeTabId);
      const activeTab = tabs.find((t) => t.id === nextActive);
      set({ tabs, activeTabId: nextActive, activeFilePath: activeTab?.path ?? null });
    },

    closeActiveTab: () => {
      const state = get();
      if (state.activeTabId) state.closeTab(state.activeTabId);
    },

    pinTab: (tabId: string) => {
      console.log(`[store] pinTab ${tabId}`);
      const tabs = get().tabs.map((t: Tab) => (t.id === tabId ? { ...t, ephemeral: false } : t));
      set({ tabs });
    },

    pinActiveEphemeral: () => {
      const state = get();
      const tab = state.tabs.find((t: Tab) => t.id === state.activeTabId);
      if (tab?.ephemeral) {
        console.log(`[store] pinActiveEphemeral → tab pinned`);
        state.pinTab(tab.id);
      }
    },

    saveTabScroll: (tabId: string, scrollPos: number, cursorPos?: Tab['cursorPos']) => {
      const tabs = get().tabs.map((t: Tab) =>
        t.id === tabId ? { ...t, scrollPos, ...(cursorPos ? { cursorPos } : {}) } : t,
      );
      set({ tabs });
    },

    expandCard: (slug: string) => {
      console.log(`[store] expandCard ${slug}`);
      const { focusedCardSlug } = get();
      if (focusedCardSlug === slug) {
        set({ focusedCardSlug: null, cardViewMode: 'collapsed' });
      } else {
        set({ focusedCardSlug: slug, cardViewMode: 'focused' });
      }
    },

    extendCard: () => {
      const { focusedCardSlug, cardViewMode } = get();
      if (!focusedCardSlug) return;
      if (cardViewMode === 'focused') {
        set({ cardViewMode: 'extended' });
      } else if (cardViewMode === 'extended') {
        set({ cardViewMode: 'focused' });
      }
    },

    collapseCard: () => {
      set({ focusedCardSlug: null, cardViewMode: 'collapsed' });
    },

    toggleFocusMode: () => {
      console.log(`[store] toggleFocusMode ${get().focusMode} → ${!get().focusMode}`);
      set({ focusMode: !get().focusMode });
    },

    toggleSidebar: () => {
      set({ sidebarVisible: !get().sidebarVisible });
    },

    setActiveSurface: (surface: 'editor' | 'terminal' | 'playground') => {
      console.log(`[store] setActiveSurface ${surface}`);
      set({ activeSurface: surface });
    },

    refreshNav: (sections: NavNode[]) => {
      console.log(`[store] refreshNav → navSections updated (${sections.length} sections)`);
      set({ navSections: sections });
    },

    setMainRepo: (config: MainRepoConfig | null) => {
      console.log(`[store] setMainRepo`, config);
      set({ mainRepoConfig: config });
    },

    setZoom: (zoom: number) => {
      const clamped = Math.max(0.5, Math.min(2.0, zoom));
      console.log(`[chrome] zoom ${get().zoom} → ${clamped}`);
      set({ zoom: clamped });
      if (typeof document !== 'undefined') {
        document.documentElement.style.zoom = String(clamped);
      }
    },

    toggleSettings: () => {
      set({ settingsVisible: !get().settingsVisible });
    },

    setPrNum: (n: number) => {
      console.log(`[store] setPrNum ${n}`);
      set({ prNum: n });
    },

    setPrDiffRanges: (ranges: Record<string, Array<{ start: number; end: number }>> | null) => {
      console.log(`[store] setPrDiffRanges ${ranges ? Object.keys(ranges).length + ' files' : 'null'}`);
      set({ prDiffRanges: ranges });
    },

    setCloningStatus: (status: 'idle' | 'cloning' | 'done') => {
      console.log(`[store] setCloningStatus ${status}`);
      set({ cloningStatus: status });
    },

    setGithubToken: (token: string) => {
      console.log(`[store] setGithubToken (${token ? 'set' : 'cleared'})`);
      set({ githubToken: token });
    },

    setGitlabToken: (token: string) => {
      console.log(`[store] setGitlabToken (${token ? 'set' : 'cleared'})`);
      set({ gitlabToken: token });
    },
  };
}

const PARTIALIZE = (state: NapStore): PersistedState => ({
  tabs: state.tabs,
  activeTabId: state.activeTabId,
  activeFilePath: state.activeFilePath,
  activeSurface: state.activeSurface,
  focusedCardSlug: state.focusedCardSlug,
  cardViewMode: state.cardViewMode,
  focusMode: state.focusMode,
  mainRepoConfig: state.mainRepoConfig,
  zoom: state.zoom,
  prNum: state.prNum,
  prDiffRanges: state.prDiffRanges,
  githubToken: state.githubToken,
  gitlabToken: state.gitlabToken,
});

/**
 * Create an independent store instance.
 *
 * - No key/storage: plain store, no persistence (vitest)
 * - With key + storage: persisted to IndexedDB via Zustand persist middleware
 */
export function createNapStore(key?: string, storage?: StateStorage) {
  if (key && storage) {
    return create<NapStore>()(
      persist(storeActions, {
        name: `nap-ui-${key}`,
        storage: createJSONStorage(() => storage),
        partialize: PARTIALIZE,
      }),
    );
  }
  return create<NapStore>()(storeActions);
}

export type NapStoreApi = ReturnType<typeof createNapStore>;
