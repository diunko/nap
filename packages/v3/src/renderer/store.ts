import { create } from 'zustand';
import type { AppSnapshot, NapkinState, AgentState } from '../shared/bridge-types';

export interface NapStore {
  napkins: NapkinState[];
  architects: AgentState[];
  activeNepicId: string;
  activeTerminalId: string | null;

  applySnapshot: (snapshot: AppSnapshot) => void;
  setActiveTerminal: (id: string) => void;
}

export const useNapStore = create<NapStore>((set) => ({
  napkins: [],
  architects: [],
  activeNepicId: '',
  activeTerminalId: null,

  applySnapshot: (snapshot: AppSnapshot) => {
    set({
      napkins: snapshot.napkins,
      architects: snapshot.architects,
      activeNepicId: snapshot.activeNepicId,
    });
  },

  setActiveTerminal: (id: string) => {
    set({ activeTerminalId: id });
  },
}));
