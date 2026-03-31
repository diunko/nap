import { create } from 'zustand';
import type { AppSnapshot, NapkinState, AgentState, WatcherEvent } from '../shared/bridge-types';

export type CardViewMode = 'collapsed' | 'focused' | 'extended';

export interface NapStore {
  // ── Model state (from main process snapshots) ──
  napkins: NapkinState[];
  architects: AgentState[];
  activeNepicId: string;
  activeTerminalId: string | null;
  watcherEvents: WatcherEvent[];

  // ── Renderer-only state (preserved across snapshots) ──
  focusedCardSlug: string | null;
  cardViewMode: CardViewMode;
  sidebarVisible: boolean;
  browserFilterText: string;
  browserFilterVisible: boolean;
  debugPanelCollapsed: boolean;
  debugPanelTab: 'model' | 'filesystem' | 'events';

  // ── Actions ──
  applySnapshot: (snapshot: AppSnapshot) => void;
  setActiveTerminal: (id: string) => void;
  expandCard: (slug: string) => void;
  extendCard: () => void;
  collapseCard: () => void;
  toggleSidebar: () => void;
  setBrowserFilter: (text: string) => void;
  setBrowserFilterVisible: (visible: boolean) => void;
  toggleDebugPanel: () => void;
  setDebugPanelTab: (tab: 'model' | 'filesystem' | 'events') => void;
}

export const useNapStore = create<NapStore>((set, get) => ({
  napkins: [],
  architects: [],
  activeNepicId: '',
  activeTerminalId: null,
  watcherEvents: [],

  focusedCardSlug: null,
  cardViewMode: 'collapsed' as CardViewMode,
  sidebarVisible: true,
  browserFilterText: '',
  browserFilterVisible: false,
  debugPanelCollapsed: false,
  debugPanelTab: 'model' as const,

  // Snapshot only updates model state — renderer-only state preserved
  applySnapshot: (snapshot: AppSnapshot) => {
    set({
      napkins: snapshot.napkins,
      architects: snapshot.architects,
      activeNepicId: snapshot.activeNepicId,
      watcherEvents: snapshot.watcherEvents ?? [],
    });
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
    set({ debugPanelCollapsed: !get().debugPanelCollapsed });
  },

  setDebugPanelTab: (tab: 'model' | 'filesystem' | 'events') => {
    set({ debugPanelTab: tab });
  },
}));
