import { create } from 'zustand';
import type { AppSnapshot, NapkinState, AgentState, NepicInfo, WatcherEvent } from '../shared/bridge-types';

export type CardViewMode = 'collapsed' | 'focused' | 'extended';

export interface NapStore {
  // ── Model state (from main process snapshots) ──
  napkins: NapkinState[];
  architects: AgentState[];
  activeNepicId: string;
  activeTerminalId: string | null;
  watcherEvents: WatcherEvent[];
  nepics: NepicInfo[];

  // ── Renderer-only state (preserved across snapshots) ──
  focusedCardSlug: string | null;
  cardViewMode: CardViewMode;
  sidebarVisible: boolean;
  browserFilterText: string;
  browserFilterVisible: boolean;
  debugPanelCollapsed: boolean;
  debugPanelTab: 'model' | 'filesystem' | 'events';
  kanbanVisible: boolean;

  // ── Actions ──
  applySnapshot: (snapshot: AppSnapshot) => void;
  setActiveTerminal: (id: string) => void;
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
}

// Per-nepic renderer state memory (not persisted)
const nepicTerminalMemory = new Map<string, string>();
const nepicFocusedCardMemory = new Map<string, string>();

/** Test-only: clear per-nepic memory between tests */
export function _resetNepicTerminalMemory(): void {
  nepicTerminalMemory.clear();
  nepicFocusedCardMemory.clear();
}

export const useNapStore = create<NapStore>((set, get) => ({
  napkins: [],
  architects: [],
  activeNepicId: '',
  activeTerminalId: null,
  watcherEvents: [],
  nepics: [],

  focusedCardSlug: null,
  cardViewMode: 'collapsed' as CardViewMode,
  sidebarVisible: true,
  browserFilterText: '',
  browserFilterVisible: false,
  debugPanelCollapsed: true,
  debugPanelTab: 'model' as const,
  kanbanVisible: false,

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
    }

    set(updates);
  },

  setActiveTerminal: (id: string) => {
    set({ activeTerminalId: id });
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
}));

// ── UI state persistence helpers ──

function persistUiState(partial: { debugPanelCollapsed?: boolean; debugPanelTab?: string }) {
  if (typeof window !== 'undefined' && window.electronAPI?.saveUiState) {
    window.electronAPI.saveUiState(partial);
  }
}

// Load persisted ui-state on mount
export async function loadPersistedUiState(): Promise<void> {
  if (typeof window === 'undefined' || !window.electronAPI?.loadUiState) return;
  const state = await window.electronAPI.loadUiState() as Record<string, unknown> | null;
  if (!state) return;
  const updates: Partial<NapStore> = {};
  if (typeof state.debugPanelCollapsed === 'boolean') updates.debugPanelCollapsed = state.debugPanelCollapsed;
  if (state.debugPanelTab === 'model' || state.debugPanelTab === 'filesystem' || state.debugPanelTab === 'events') {
    updates.debugPanelTab = state.debugPanelTab;
  }
  if (Object.keys(updates).length > 0) useNapStore.setState(updates);
}
