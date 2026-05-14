import { create } from 'zustand';
import type { AppSnapshot, NapkinState, AgentState, NepicInfo, WatcherEvent } from '../shared/bridge-types';
import { THEMES, applyTheme, findTheme } from './themes';

export type CardViewMode = 'collapsed' | 'focused' | 'extended';

export const TERMINAL_TAB_ID = '__terminal__';

export interface Tab {
  id: string;
  path: string;
  type: 'file' | 'terminal';
  ephemeral: boolean;
  ghost?: boolean;
  title?: string;
  scrollPos?: number;
  cursorPos?: { lineNumber: number; column: number };
}

export interface NapStore {
  // ── Model state (from main process snapshots) ──
  napkins: NapkinState[];
  architects: AgentState[];
  activeNepicId: string;
  activeTerminalId: string | null;
  watcherEvents: WatcherEvent[];
  nepics: NepicInfo[];

  // ── Renderer-only state (preserved across snapshots) ──
  activeFilePath: string | null;
  focusedCardSlug: string | null;
  cardViewMode: CardViewMode;
  sidebarVisible: boolean;
  browserFilterText: string;
  browserFilterVisible: boolean;
  debugPanelCollapsed: boolean;
  debugPanelTab: 'model' | 'filesystem' | 'events';
  kanbanVisible: boolean;

  // ── Tab + right pane state ──
  rightPaneMode: 'terminal' | 'code';
  rightFilePath: string | null;
  rightFileLine: number | null;
  leftTabs: Tab[];
  activeLeftTabId: string | null;
  rightTabs: Tab[];
  activeRightTabId: string | null;

  // ── Theme + render mode ──
  currentThemeName: string;
  leftPaneRenderMode: 'edit' | 'rendered';

  // ── Internal (reload trigger for ghost promotion) ──
  _fileReloadVersion: number;

  // ── Actions ──
  applySnapshot: (snapshot: AppSnapshot) => void;
  setActiveTerminal: (id: string) => void;
  openFile: (path: string) => void;
  openCode: (opts: { path: string; line?: number; col?: number }) => void;
  openDoc: (path: string) => void;
  closeTab: (pane: 'left' | 'right', tabId: string) => void;
  closeActiveTab: (pane: 'left' | 'right') => void;
  pinTab: (pane: 'left' | 'right', tabId: string) => void;
  pinActiveEphemeral: (pane: 'left' | 'right') => void;
  saveTabScroll: (pane: 'left' | 'right', tabId: string, scrollPos: number, cursorPos?: Tab['cursorPos']) => void;
  expandCard: (slug: string) => void;
  focusCard: (slug: string) => void;
  extendCard: () => void;
  collapseCard: () => void;
  toggleSidebar: () => void;
  toggleKanban: () => void;
  switchNepic: (id: string) => void;
  setBrowserFilter: (text: string) => void;
  setBrowserFilterVisible: (visible: boolean) => void;
  toggleDebugPanel: () => void;
  setDebugPanelTab: (tab: 'model' | 'filesystem' | 'events') => void;
  cycleTheme: () => void;
  toggleRenderMode: () => void;
  promoteGhostTab: (path: string) => void;
}

// Per-nepic renderer state memory (not persisted)
const nepicTerminalMemory = new Map<string, string>();
const nepicFocusedCardMemory = new Map<string, string>();
const nepicFilePathMemory = new Map<string, string>();
const nepicLeftTabsMemory = new Map<string, { tabs: Tab[]; activeId: string | null }>();
const nepicRightTabsMemory = new Map<string, { tabs: Tab[]; activeId: string | null }>();

/** Test-only: clear per-nepic memory between tests */
export function _resetNepicTerminalMemory(): void {
  nepicTerminalMemory.clear();
  nepicFocusedCardMemory.clear();
  nepicFilePathMemory.clear();
  nepicLeftTabsMemory.clear();
  nepicRightTabsMemory.clear();
}

let tabIdCounter = 0;
function nextTabId(): string {
  return `tab-${++tabIdCounter}`;
}

/** Find or create a tab for a path in a tab array. Returns [updatedTabs, tabId]. */
function upsertTab(
  tabs: Tab[],
  path: string,
  type: 'file' | 'terminal',
  ephemeral: boolean,
): [Tab[], string] {
  // Existing tab with same path?
  const existing = tabs.find((t) => t.path === path && t.type === type);
  if (existing) return [tabs, existing.id];

  // Reuse ephemeral slot?
  if (ephemeral) {
    const ephIdx = tabs.findIndex((t) => t.ephemeral);
    if (ephIdx !== -1) {
      const updated = [...tabs];
      updated[ephIdx] = { ...updated[ephIdx], path, type };
      return [updated, updated[ephIdx].id];
    }
  }

  // Create new tab (ephemeral goes rightmost)
  const tab: Tab = { id: nextTabId(), path, type, ephemeral };
  return [[...tabs, tab], tab.id];
}

/** Remove a tab and pick the next active. */
function removeTab(
  tabs: Tab[],
  tabId: string,
  activeId: string | null,
): [Tab[], string | null] {
  const idx = tabs.findIndex((t) => t.id === tabId);
  if (idx === -1) return [tabs, activeId];
  const newTabs = tabs.filter((t) => t.id !== tabId);
  if (newTabs.length === 0) return [newTabs, null];
  if (activeId !== tabId) return [newTabs, activeId];
  // Pick neighbor: prefer left, then right
  const nextIdx = Math.min(idx, newTabs.length - 1);
  return [newTabs, newTabs[nextIdx].id];
}

export const useNapStore = create<NapStore>((set, get) => ({
  napkins: [],
  architects: [],
  activeNepicId: '',
  activeTerminalId: null,
  watcherEvents: [],
  nepics: [],

  activeFilePath: null,
  focusedCardSlug: null,
  cardViewMode: 'collapsed' as CardViewMode,
  sidebarVisible: true,
  browserFilterText: '',
  browserFilterVisible: false,
  debugPanelCollapsed: true,
  debugPanelTab: 'model' as const,
  kanbanVisible: false,

  rightPaneMode: 'terminal' as const,
  rightFilePath: null,
  rightFileLine: null,
  leftTabs: [],
  activeLeftTabId: null,
  rightTabs: [],
  activeRightTabId: null,

  currentThemeName: THEMES[0].name,
  leftPaneRenderMode: 'edit' as const,
  _fileReloadVersion: 0,

  // Snapshot only updates model state — renderer-only state preserved
  applySnapshot: (snapshot: AppSnapshot) => {
    const prev = get();
    const nepicChanged = snapshot.activeNepicId !== prev.activeNepicId && prev.activeNepicId !== '';

    // Save current state for the old nepic before switching
    if (nepicChanged && prev.activeNepicId) {
      if (prev.activeTerminalId) {
        nepicTerminalMemory.set(prev.activeNepicId, prev.activeTerminalId);
      }
      if (prev.focusedCardSlug) {
        nepicFocusedCardMemory.set(prev.activeNepicId, prev.focusedCardSlug);
      }
      if (prev.activeFilePath) {
        nepicFilePathMemory.set(prev.activeNepicId, prev.activeFilePath);
      }
      // Save tab state
      nepicLeftTabsMemory.set(prev.activeNepicId, { tabs: prev.leftTabs, activeId: prev.activeLeftTabId });
      nepicRightTabsMemory.set(prev.activeNepicId, { tabs: prev.rightTabs, activeId: prev.activeRightTabId });
    }

    const updates: Partial<NapStore> = {
      napkins: snapshot.napkins,
      architects: snapshot.architects,
      activeNepicId: snapshot.activeNepicId,
      nepics: snapshot.nepics ?? [],
      watcherEvents: snapshot.watcherEvents ?? [],
    };

    // On nepic switch, restore last terminal + focused card or pick architect
    if (nepicChanged) {
      const remembered = nepicTerminalMemory.get(snapshot.activeNepicId);
      if (remembered) {
        updates.activeTerminalId = remembered;
      } else {
        const arch = snapshot.architects.find(a => a.running)
          ?? snapshot.architects.find(a => a.started);
        updates.activeTerminalId = arch?.id ?? null;
      }

      const rememberedFile = nepicFilePathMemory.get(snapshot.activeNepicId);
      updates.activeFilePath = rememberedFile ?? null;

      const rememberedCard = nepicFocusedCardMemory.get(snapshot.activeNepicId);
      if (rememberedCard) {
        updates.focusedCardSlug = rememberedCard;
        updates.cardViewMode = 'focused';
      } else {
        // Default: focus the architect card
        const arch = snapshot.architects[0];
        updates.focusedCardSlug = arch?.id ?? null;
        updates.cardViewMode = arch ? 'focused' : 'collapsed';
      }

      // Restore tab state
      const savedLeft = nepicLeftTabsMemory.get(snapshot.activeNepicId);
      updates.leftTabs = savedLeft?.tabs ?? [];
      updates.activeLeftTabId = savedLeft?.activeId ?? null;
      const savedRight = nepicRightTabsMemory.get(snapshot.activeNepicId);
      updates.rightTabs = savedRight?.tabs ?? [];
      updates.activeRightTabId = savedRight?.activeId ?? null;
      // Derive rightPaneMode from active right tab
      const activeRTab = (savedRight?.tabs ?? []).find((t: Tab) => t.id === savedRight?.activeId);
      updates.rightPaneMode = activeRTab?.type === 'file' ? 'code' : 'terminal';
      updates.rightFilePath = activeRTab?.type === 'file' ? activeRTab.path : null;
      updates.rightFileLine = null;
    }

    set(updates);
  },

  setActiveTerminal: (id: string) => {
    const prev = get();

    // Look up agent name for the terminal tab title
    const allAgents = [...prev.napkins.flatMap((n) => n.agents), ...prev.architects];
    const agent = allAgents.find((a) => a.id === id);
    const title = agent?.name ?? id;

    // Find or create the sentinel terminal tab (always at position 0)
    const existingIdx = prev.rightTabs.findIndex((t) => t.id === TERMINAL_TAB_ID);
    let tabs: Tab[];
    if (existingIdx !== -1) {
      // Update in place
      tabs = prev.rightTabs.map((t) =>
        t.id === TERMINAL_TAB_ID ? { ...t, path: id, title } : t,
      );
    } else {
      // Create at position 0
      const termTab: Tab = { id: TERMINAL_TAB_ID, path: id, type: 'terminal', ephemeral: false, title };
      tabs = [termTab, ...prev.rightTabs];
    }

    set({
      activeTerminalId: id,
      rightPaneMode: 'terminal',
      rightTabs: tabs,
      activeRightTabId: TERMINAL_TAB_ID,
    });
  },

  openFile: (path: string) => {
    // Delegate to openDoc for backward compat (sidebar clicks)
    get().openDoc(path);
  },

  openCode: (opts: { path: string; line?: number; col?: number }) => {
    const prev = get();
    const [tabs, tabId] = upsertTab(prev.rightTabs, opts.path, 'file', true);
    set({
      rightPaneMode: 'code',
      rightFilePath: opts.path,
      rightFileLine: opts.line ?? null,
      rightTabs: tabs,
      activeRightTabId: tabId,
    });
  },

  openDoc: (path: string) => {
    const prev = get();
    const [tabs, tabId] = upsertTab(prev.leftTabs, path, 'file', true);
    set({
      activeFilePath: path,
      leftTabs: tabs,
      activeLeftTabId: tabId,
    });
  },

  closeTab: (pane: 'left' | 'right', tabId: string) => {
    const prev = get();
    if (pane === 'left') {
      const [tabs, nextActive] = removeTab(prev.leftTabs, tabId, prev.activeLeftTabId);
      const activeTab = tabs.find((t) => t.id === nextActive);
      set({
        leftTabs: tabs,
        activeLeftTabId: nextActive,
        activeFilePath: activeTab?.path ?? null,
      });
    } else {
      // Permanent terminal slot — can never be closed
      const tab = prev.rightTabs.find((t) => t.id === tabId);
      if (tab?.id === TERMINAL_TAB_ID) return;
      const [tabs, nextActive] = removeTab(prev.rightTabs, tabId, prev.activeRightTabId);
      const activeTab = tabs.find((t) => t.id === nextActive);
      set({
        rightTabs: tabs,
        activeRightTabId: nextActive,
        rightPaneMode: activeTab?.type === 'file' ? 'code' : 'terminal',
        rightFilePath: activeTab?.type === 'file' ? activeTab.path : null,
        rightFileLine: null,
        activeTerminalId: activeTab?.type === 'terminal' ? activeTab.path : prev.activeTerminalId,
      });
    }
  },

  closeActiveTab: (pane: 'left' | 'right') => {
    const state = get();
    const activeId = pane === 'left' ? state.activeLeftTabId : state.activeRightTabId;
    if (activeId) state.closeTab(pane, activeId);
  },

  pinTab: (pane: 'left' | 'right', tabId: string) => {
    const tabs = pane === 'left' ? get().leftTabs : get().rightTabs;
    const updated = tabs.map((t) => (t.id === tabId ? { ...t, ephemeral: false } : t));
    set(pane === 'left' ? { leftTabs: updated } : { rightTabs: updated });
  },

  pinActiveEphemeral: (pane: 'left' | 'right') => {
    const state = get();
    const tabs = pane === 'left' ? state.leftTabs : state.rightTabs;
    const activeId = pane === 'left' ? state.activeLeftTabId : state.activeRightTabId;
    const tab = tabs.find((t) => t.id === activeId);
    if (tab?.ephemeral) state.pinTab(pane, tab.id);
  },

  saveTabScroll: (pane: 'left' | 'right', tabId: string, scrollPos: number, cursorPos?: Tab['cursorPos']) => {
    const tabs = pane === 'left' ? get().leftTabs : get().rightTabs;
    const updated = tabs.map((t) =>
      t.id === tabId ? { ...t, scrollPos, ...(cursorPos ? { cursorPos } : {}) } : t,
    );
    set(pane === 'left' ? { leftTabs: updated } : { rightTabs: updated });
  },

  // Click card → focused. Click same card → collapsed.
  expandCard: (slug: string) => {
    const { focusedCardSlug } = get();
    if (focusedCardSlug === slug) {
      set({ focusedCardSlug: null, cardViewMode: 'collapsed' });
    } else {
      set({ focusedCardSlug: slug, cardViewMode: 'focused' });
    }
  },

  // Force focus a card (always focus, never toggle — used by kanban navigation)
  focusCard: (slug: string) => {
    set({ focusedCardSlug: slug, cardViewMode: 'focused', sidebarVisible: true });
  },

  // Cmd+E → toggle focused ↔ extended (only if a card is focused)
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

  toggleSidebar: () => {
    set({ sidebarVisible: !get().sidebarVisible });
  },

  toggleKanban: () => {
    set({ kanbanVisible: !get().kanbanVisible });
  },

  switchNepic: (id: string) => {
    if (typeof window !== 'undefined' && window.electronAPI?.switchNepic) {
      window.electronAPI.switchNepic(id);
    }
  },

  setBrowserFilter: (text: string) => {
    set({ browserFilterText: text });
  },

  setBrowserFilterVisible: (visible: boolean) => {
    if (!visible) {
      set({ browserFilterVisible: false, browserFilterText: '' });
    } else {
      set({ browserFilterVisible: true });
    }
  },

  toggleDebugPanel: () => {
    const next = !get().debugPanelCollapsed;
    set({ debugPanelCollapsed: next });
    persistUiState({ debugPanelCollapsed: next, debugPanelTab: get().debugPanelTab });
  },

  setDebugPanelTab: (tab: 'model' | 'filesystem' | 'events') => {
    set({ debugPanelTab: tab });
    persistUiState({ debugPanelCollapsed: get().debugPanelCollapsed, debugPanelTab: tab });
  },

  cycleTheme: () => {
    const current = get().currentThemeName;
    const idx = THEMES.findIndex((t) => t.name === current);
    const next = THEMES[(idx + 1) % THEMES.length];
    set({ currentThemeName: next.name });
    applyTheme(next);
    persistUiState({ theme: next.name });
  },

  toggleRenderMode: () => {
    const next = get().leftPaneRenderMode === 'edit' ? 'rendered' : 'edit';
    set({ leftPaneRenderMode: next });
    persistUiState({ leftPaneRenderMode: next });
  },

  promoteGhostTab: (path: string) => {
    const prev = get();
    const leftTabs = prev.leftTabs.map((t) =>
      t.path === path ? { ...t, ghost: undefined } : t,
    );
    const rightTabs = prev.rightTabs.map((t) =>
      t.path === path ? { ...t, ghost: undefined } : t,
    );
    const updates: Partial<NapStore> = { leftTabs, rightTabs };
    // If the promoted tab is the active left tab, trigger a file reload
    const activeLeftTab = prev.leftTabs.find((t) => t.id === prev.activeLeftTabId);
    if (activeLeftTab?.path === path) {
      updates._fileReloadVersion = prev._fileReloadVersion + 1;
    }
    set(updates);
  },
}));

// ── UI state persistence helpers ──

function persistUiState(partial: {
  debugPanelCollapsed?: boolean;
  debugPanelTab?: string;
  theme?: string;
  leftPaneRenderMode?: string;
}) {
  if (typeof window !== 'undefined' && window.electronAPI?.saveUiState) {
    window.electronAPI.saveUiState(partial);
  }
}

/** Save full session state — called on quit (beforeunload). */
export function persistFullUiState(): void {
  if (typeof window === 'undefined' || !window.electronAPI?.saveUiState) return;
  const state = useNapStore.getState();
  const activeLeftTab = state.leftTabs.find((t) => t.id === state.activeLeftTabId);
  const activeRightTab = state.rightTabs.find((t) => t.id === state.activeRightTabId);
  window.electronAPI.saveUiState({
    focusedCardSlug: state.focusedCardSlug,
    cardViewMode: state.cardViewMode,
    activeTerminalId: state.activeTerminalId,
    leftPaneRenderMode: state.leftPaneRenderMode,
    leftTabs: state.leftTabs
      .filter((t) => t.type === 'file')
      .map((t) => ({ path: t.path, ephemeral: t.ephemeral })),
    rightTabs: state.rightTabs
      .filter((t) => t.type === 'file')
      .map((t) => ({ path: t.path, ephemeral: t.ephemeral })),
    activeLeftTabPath: activeLeftTab?.path ?? null,
    activeRightTabPath: activeRightTab?.type === 'file' ? activeRightTab.path : null,
    theme: state.currentThemeName,
    debugPanelCollapsed: state.debugPanelCollapsed,
    debugPanelTab: state.debugPanelTab,
  });
}

// Load persisted ui-state on mount
export async function loadPersistedUiState(): Promise<void> {
  if (typeof window === 'undefined' || !window.electronAPI?.loadUiState) return;
  const state = await window.electronAPI.loadUiState() as Record<string, unknown> | null;
  if (!state) return;
  const updates: Partial<NapStore> = {};

  // ── Existing fields ──
  if (typeof state.debugPanelCollapsed === 'boolean') updates.debugPanelCollapsed = state.debugPanelCollapsed;
  if (state.debugPanelTab === 'model' || state.debugPanelTab === 'filesystem' || state.debugPanelTab === 'events') {
    updates.debugPanelTab = state.debugPanelTab;
  }
  if (typeof state.theme === 'string') {
    const theme = findTheme(state.theme as string);
    updates.currentThemeName = theme.name;
  }
  if (state.leftPaneRenderMode === 'edit' || state.leftPaneRenderMode === 'rendered') {
    updates.leftPaneRenderMode = state.leftPaneRenderMode;
  }

  // ── focusedCardSlug ──
  if (typeof state.focusedCardSlug === 'string') {
    const store = useNapStore.getState();
    const napkinMatch = store.napkins.some((n) => n.slug === state.focusedCardSlug);
    const archMatch = store.architects.some((a) => a.id === state.focusedCardSlug);
    if (napkinMatch || archMatch) {
      updates.focusedCardSlug = state.focusedCardSlug as string;
      const savedMode = state.cardViewMode;
      updates.cardViewMode = (savedMode === 'focused' || savedMode === 'extended') ? savedMode : 'focused';
    }
  }

  // ── leftTabs ──
  if (Array.isArray(state.leftTabs)) {
    const saved = state.leftTabs as Array<{ path?: string; ephemeral?: boolean }>;
    const checks = await Promise.all(
      saved.map(async (entry) => {
        if (typeof entry.path !== 'string') return null;
        const content = await window.electronAPI!.fileRead(entry.path);
        return {
          path: entry.path,
          ephemeral: entry.ephemeral ?? false,
          ghost: content === null || content === undefined,
        };
      }),
    );

    const tabs: Tab[] = [];
    for (const check of checks) {
      if (!check) continue;
      tabs.push({
        id: nextTabId(),
        path: check.path,
        type: 'file',
        ephemeral: check.ephemeral,
        ...(check.ghost ? { ghost: true } : {}),
      });
      if (check.ghost) {
        await window.electronAPI!.watchGhost(check.path);
      }
    }

    updates.leftTabs = tabs;

    // Active left tab — match by path, skip ghosts
    const activeLeftPath = typeof state.activeLeftTabPath === 'string' ? state.activeLeftTabPath as string : null;
    const match = activeLeftPath ? tabs.find((t) => t.path === activeLeftPath && !t.ghost) : null;
    const fallback = tabs.find((t) => !t.ghost);
    const activeTab = match ?? fallback ?? null;
    updates.activeLeftTabId = activeTab?.id ?? null;
    updates.activeFilePath = activeTab?.path ?? null;
  }

  // ── rightTabs (file tabs only — terminal reconstructed from activeTerminalId) ──
  if (Array.isArray(state.rightTabs)) {
    const saved = state.rightTabs as Array<{ path?: string; ephemeral?: boolean }>;
    const checks = await Promise.all(
      saved.map(async (entry) => {
        if (typeof entry.path !== 'string') return null;
        const content = await window.electronAPI!.fileRead(entry.path);
        return {
          path: entry.path,
          ephemeral: entry.ephemeral ?? false,
          ghost: content === null || content === undefined,
        };
      }),
    );

    const tabs: Tab[] = [];
    for (const check of checks) {
      if (!check) continue;
      tabs.push({
        id: nextTabId(),
        path: check.path,
        type: 'file',
        ephemeral: check.ephemeral,
        ...(check.ghost ? { ghost: true } : {}),
      });
      if (check.ghost) {
        await window.electronAPI!.watchGhost(check.path);
      }
    }

    updates.rightTabs = tabs;
  }

  if (Object.keys(updates).length > 0) useNapStore.setState(updates);

  // ── activeTerminalId — needs setActiveTerminal action (creates terminal tab) ──
  if (typeof state.activeTerminalId === 'string') {
    const store = useNapStore.getState();
    const allAgents = [...store.napkins.flatMap((n) => n.agents), ...store.architects];
    if (allAgents.some((a) => a.id === state.activeTerminalId)) {
      store.setActiveTerminal(state.activeTerminalId as string);
    }
  }

  // ── If saved active right tab was a file, switch to it ──
  if (typeof state.activeRightTabPath === 'string') {
    const store = useNapStore.getState();
    const match = store.rightTabs.find(
      (t) => t.path === state.activeRightTabPath && t.type === 'file' && !t.ghost,
    );
    if (match) {
      useNapStore.setState({
        activeRightTabId: match.id,
        rightPaneMode: 'code',
        rightFilePath: match.path,
      });
    }
  }
}
