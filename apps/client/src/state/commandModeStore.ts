import { create } from 'zustand';

/**
 * A pending unit command that waits for a target click (UI-only, never sent):
 * attack-move (F) waits for a point or an enemy. Esc or a right click cancels it.
 */
interface CommandModeState {
  mode: 'attackMove' | null;
  setMode: (mode: 'attackMove' | null) => void;
}

export const useCommandModeStore = create<CommandModeState>()((set) => ({
  mode: null,
  setMode: (mode) => set({ mode }),
}));
