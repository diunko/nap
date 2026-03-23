import { create } from 'zustand';
import { createTerminalInstance, disposeTerminal } from './terminal-registry';
import { createFileLinkProvider } from './file-link-provider';
import type { ScrollLockMode } from './scroll-lock';

// ── Shared types ──

export type NapkinPhase = 'backlog' | 'todo' | 'doing' | 'review' | 'done';
export type AgentStatus = 'run' | 'done' | 'nap' | 'exit' | 'orphaned';

export interface AgentEntry {
  name: string;
  files: string[];
}

export interface NapkinEntry {
  slug: string;
  artifacts: string[];
  agents: AgentEntry[];
  napkinBullets: string[];
  status: NapkinPhase;
}

// ── Dot / phase helpers ──

const DOT_COLORS: Record<AgentStatus, string> = {
  run: '#22c55e', done: '#3b82f6', nap: '#f59e0b', exit: '#6b7280', orphaned: '#6b7280',
};
export function dotColor(status: AgentStatus): string { return DOT_COLORS[status]; }
export function isDotHollow(status: AgentStatus): boolean { return status === 'nap' || status === 'exit'; }
export function isDotPulsing(status: AgentStatus): boolean { return status === 'run'; }

const PHASE_COLORS: Record<NapkinPhase, string> = {
  done: '#6b7280', review: '#3b82f6', doing: '#22c55e', todo: '#6b7280', backlog: '#6b7280',
};
export function phaseColor(phase: NapkinPhase): string { return PHASE_COLORS[phase]; }

export function terminalStatusToAgent(status: TerminalMeta['status'], isOrphaned?: boolean): AgentStatus {
  if (isOrphaned) return 'orphaned';
  switch (status) {
    case 'running': return 'run';
    case 'done': return 'done';
    case 'exited': return 'exit';
  }
}

// ── Terminal meta ──

export interface TerminalMeta {
  id: string;
  name: string;
  status: 'running' | 'exited' | 'done';
  parentId?: string;
  cwd?: string;
  createdAt: number;
  role?: string;
  napkinSlug?: string;
  isOrphaned?: boolean;
  ccSessionUuid?: string;
}

export type CardViewMode = 'collapsed' | 'focused' | 'extended';

export interface NepicInfo {
  id: string;
  name: string;
  slug: string;
}

interface TerminalStore {
  terminals: TerminalMeta[];
  activeTerminalId: string | null;
  sidebarVisible: boolean;
  scrollLockModes: Record<string, ScrollLockMode>;

  // Browser state
  focusedCardSlug: string | null;
  cardViewMode: CardViewMode;
  activeNepicId: string;
  browserFilterText: string;
  browserFilterVisible: boolean;

  // Nepics
  nepics: NepicInfo[];

  // Napkin data (live-wired)
  napkins: NapkinEntry[];
  napkinsBasePath: string | null;
  kanbanVisible: boolean;

  createTerminal: (name: string, parentId?: string, command?: string) => string;
  addSocketTerminal: (id: string, name: string, parentId?: string | null, cwd?: string, role?: string, napkinSlug?: string) => void;
  removeTerminal: (id: string) => void;
  disposeTerminalOnly: (id: string) => void;
  closeActiveTerminal: () => void;
  setActive: (id: string) => void;
  setStatus: (id: string, status: TerminalMeta['status']) => void;
  toggleSidebar: () => void;
  setScrollLockMode: (id: string, mode: ScrollLockMode) => void;

  addOrphanedTerminal: (id: string, name: string, opts: { role?: string; napkinSlug?: string; ccSessionUuid?: string; parentId?: string; cwd?: string }) => void;
  resumeOrphanedTerminal: (id: string) => void;

  // Nepic actions
  setNepics: (nepics: NepicInfo[]) => void;
  addNepic: (nepic: NepicInfo) => void;

  // Browser actions
  expandCard: (slug: string) => void;
  collapseCard: () => void;
  extendCard: () => void;
  setActiveNepic: (id: string) => void;
  switchNepic: (id: string) => void;
  setBrowserFilter: (text: string) => void;
  setBrowserFilterVisible: (visible: boolean) => void;

  // Napkin actions
  setNapkinData: (data: { slug: string; artifacts: string[]; agents: AgentEntry[]; napkinBullets: string[] } | { slug: string; artifacts: string[]; agents: AgentEntry[]; napkinBullets: string[] }[]) => void;
  setNapkinsBasePath: (path: string | null) => void;
  mergeNapkinStatus: (slug: string, status: string) => void;
  toggleKanban: () => void;
}

export const useTerminalStore = create<TerminalStore>((set, get) => ({
  terminals: [],
  activeTerminalId: null,
  sidebarVisible: true,
  scrollLockModes: {},

  // Browser state
  focusedCardSlug: null,
  cardViewMode: 'collapsed' as CardViewMode,
  activeNepicId: '',
  browserFilterText: '',
  browserFilterVisible: false,

  // Nepics
  nepics: [],

  // Napkin data
  napkins: [],
  napkinsBasePath: null,
  kanbanVisible: false,

  createTerminal: (name: string, parentId?: string, command?: string) => {
    const id = crypto.randomUUID();

    // Create xterm instance in registry (outside React)
    const entry = createTerminalInstance(id);

    // Wire xterm input → pty
    entry.terminal.onData((data: string) => {
      window.electronAPI.pty.write(id, data);
    });

    // Register file link provider
    entry.terminal.registerLinkProvider(
      createFileLinkProvider(
        entry.terminal,
        () => get().terminals.find((t) => t.id === id)?.cwd || '/',
        (filePath) => window.electronAPI.openFilePath(filePath),
      ),
    );

    // Request pty from main process
    window.electronAPI.pty.create(id, { name, parentId, command });
    window.electronAPI.pty.resize(id, entry.terminal.cols, entry.terminal.rows);
    window.electronAPI.pty.ready(id);

    // Update store
    const isFirst = get().terminals.length === 0;
    set((state) => ({
      terminals: [
        ...state.terminals,
        { id, name, status: 'running' as const, parentId, createdAt: Date.now() },
      ],
      activeTerminalId: isFirst ? id : state.activeTerminalId,
    }));

    return id;
  },

  addSocketTerminal: (id: string, name: string, parentId?: string | null, cwd?: string, role?: string, napkinSlug?: string) => {
    // Create xterm instance in registry (outside React)
    const entry = createTerminalInstance(id);

    // Wire xterm input → pty
    entry.terminal.onData((data: string) => {
      window.electronAPI.pty.write(id, data);
    });

    // Register file link provider
    entry.terminal.registerLinkProvider(
      createFileLinkProvider(
        entry.terminal,
        () => get().terminals.find((t) => t.id === id)?.cwd || '/',
        (filePath) => window.electronAPI.openFilePath(filePath),
      ),
    );

    // PTY already exists in main — just signal ready
    window.electronAPI.pty.resize(id, entry.terminal.cols, entry.terminal.rows);
    window.electronAPI.pty.ready(id);

    set((state) => ({
      terminals: [
        ...state.terminals,
        {
          id,
          name,
          status: 'running' as const,
          parentId: parentId ?? undefined,
          cwd,
          createdAt: Date.now(),
          role,
          napkinSlug,
        },
      ],
    }));
  },

  removeTerminal: (id: string) => {
    window.electronAPI.pty.kill(id);
    disposeTerminal(id);
    set((state) => {
      const terminals = state.terminals.filter((t) => t.id !== id);
      let activeTerminalId = state.activeTerminalId;
      if (activeTerminalId === id) {
        activeTerminalId = terminals.length > 0 ? terminals[0].id : null;
      }
      return { terminals, activeTerminalId };
    });
  },

  disposeTerminalOnly: (id: string) => {
    disposeTerminal(id);
    set((state) => {
      const terminals = state.terminals.filter((t) => t.id !== id);
      let activeTerminalId = state.activeTerminalId;
      if (activeTerminalId === id) {
        activeTerminalId = terminals.length > 0 ? terminals[0].id : null;
      }
      return { terminals, activeTerminalId };
    });
  },

  closeActiveTerminal: () => {
    const { activeTerminalId, terminals } = get();
    if (!activeTerminalId) return;
    if (terminals.length <= 1) return;
    const active = terminals.find((t) => t.id === activeTerminalId);
    if (!active) return;
    if (active.status === 'running') return;

    window.electronAPI.pty.close(activeTerminalId);
    disposeTerminal(activeTerminalId);
    set((state) => {
      const remaining = state.terminals.filter((t) => t.id !== activeTerminalId);
      return {
        terminals: remaining,
        activeTerminalId: remaining.length > 0 ? remaining[0].id : null,
      };
    });
  },

  setActive: (id: string) => {
    set({ activeTerminalId: id });
  },

  setStatus: (id: string, status: TerminalMeta['status']) => {
    set((state) => ({
      terminals: state.terminals.map((t) => (t.id === id ? { ...t, status } : t)),
    }));
  },

  toggleSidebar: () => {
    set((state) => ({ sidebarVisible: !state.sidebarVisible }));
  },

  setScrollLockMode: (id: string, mode: ScrollLockMode) => {
    set((state) => ({
      scrollLockModes: { ...state.scrollLockModes, [id]: mode },
    }));
  },

  addOrphanedTerminal: (id: string, name: string, opts) => {
    set((state) => ({
      terminals: [
        ...state.terminals,
        {
          id,
          name,
          status: 'running' as const,
          isOrphaned: true,
          ccSessionUuid: opts.ccSessionUuid,
          role: opts.role,
          napkinSlug: opts.napkinSlug,
          parentId: opts.parentId,
          cwd: opts.cwd,
          createdAt: Date.now(),
        },
      ],
    }));
  },

  resumeOrphanedTerminal: (id: string) => {
    const terminal = get().terminals.find((t) => t.id === id);
    if (!terminal?.isOrphaned || !terminal.ccSessionUuid) return;

    // Create xterm instance
    const entry = createTerminalInstance(id);
    entry.terminal.onData((data: string) => {
      window.electronAPI.pty.write(id, data);
    });
    entry.terminal.registerLinkProvider(
      createFileLinkProvider(
        entry.terminal,
        () => get().terminals.find((t) => t.id === id)?.cwd || '/',
        (filePath) => window.electronAPI.openFilePath(filePath),
      ),
    );

    // Tell main to resume this agent's pty
    window.electronAPI.pty.resume(id, terminal.ccSessionUuid);
    window.electronAPI.pty.resize(id, entry.terminal.cols, entry.terminal.rows);
    window.electronAPI.pty.ready(id);

    // Update store — no longer orphaned
    set((state) => ({
      terminals: state.terminals.map((t) =>
        t.id === id ? { ...t, isOrphaned: false } : t,
      ),
    }));
  },

  // Nepic actions
  setNepics: (nepics) => set({ nepics }),

  addNepic: (nepic) =>
    set((state) => ({ nepics: [...state.nepics, nepic] })),

  // Browser actions
  expandCard: (slug: string) => {
    const current = get().focusedCardSlug;
    if (current === slug) {
      // Clicking already-focused card collapses it
      set({ focusedCardSlug: null, cardViewMode: 'collapsed' });
    } else {
      set({ focusedCardSlug: slug, cardViewMode: 'focused' });
    }
  },

  collapseCard: () => {
    set({ focusedCardSlug: null, cardViewMode: 'collapsed' });
  },

  extendCard: () => {
    const { focusedCardSlug, cardViewMode } = get();
    if (!focusedCardSlug) return;
    set({
      cardViewMode: cardViewMode === 'extended' ? 'focused' : 'extended',
    });
  },

  setActiveNepic: (id: string) => {
    set({ activeNepicId: id });
  },

  switchNepic: async (id: string) => {
    if (id === get().activeNepicId) return;
    set({ activeNepicId: id, napkins: [] });
    const result = await window.electronAPI.switchNepic(id);
    // Guard: if another switch superseded this one, bail
    if (get().activeNepicId !== id) return;
    set({ napkinsBasePath: result.napkinsBasePath });
    for (const { slug, status } of result.napkinStatuses) {
      get().mergeNapkinStatus(slug, status);
    }
    if (result.architectSessionId) {
      set({ activeTerminalId: result.architectSessionId });
    }
  },

  setBrowserFilter: (text: string) => {
    set({ browserFilterText: text });
  },

  setBrowserFilterVisible: (visible: boolean) => {
    set({ browserFilterVisible: visible });
    if (!visible) set({ browserFilterText: '' });
  },

  // Napkin actions
  setNapkinData: (data) => {
    if (Array.isArray(data)) {
      // Full scan — replace all napkins (preserving statuses for matching slugs)
      set((state) => {
        const napkins = data.map((item) => {
          const existing = state.napkins.find((n) => n.slug === item.slug);
          return {
            slug: item.slug,
            artifacts: item.artifacts,
            agents: item.agents,
            napkinBullets: item.napkinBullets,
            status: existing?.status ?? ('backlog' as NapkinPhase),
          };
        });
        return { napkins };
      });
    } else {
      // Incremental update — merge single item
      set((state) => {
        const napkins = [...state.napkins];
        const idx = napkins.findIndex((n) => n.slug === data.slug);
        if (idx >= 0) {
          napkins[idx] = {
            ...napkins[idx],
            artifacts: data.artifacts,
            agents: data.agents,
            napkinBullets: data.napkinBullets,
          };
        } else {
          napkins.push({
            slug: data.slug,
            artifacts: data.artifacts,
            agents: data.agents,
            napkinBullets: data.napkinBullets,
            status: 'backlog' as NapkinPhase,
          });
        }
        return { napkins };
      });
    }
  },

  setNapkinsBasePath: (p) => set({ napkinsBasePath: p }),

  mergeNapkinStatus: (slug: string, status: string) => {
    set((state) => {
      const napkins = [...state.napkins];
      const idx = napkins.findIndex((n) => n.slug === slug);
      if (idx >= 0) {
        napkins[idx] = { ...napkins[idx], status: status as NapkinPhase };
      } else {
        // Status arrived before filesystem data — create placeholder
        napkins.push({
          slug,
          artifacts: [],
          agents: [],
          napkinBullets: [],
          status: status as NapkinPhase,
        });
      }
      return { napkins };
    });
  },

  toggleKanban: () => {
    set((state) => ({ kanbanVisible: !state.kanbanVisible }));
  },
}));
