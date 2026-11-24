import { create } from 'zustand';

/** Client-only presentation settings. Never put authoritative game state here. */
interface SettingsState {
  shadows: boolean;
  showStats: boolean;
  /** Pan the camera when the pointer touches a screen edge (useful on trackpads). */
  edgeScroll: boolean;
  toggleShadows: () => void;
  toggleStats: () => void;
  toggleEdgeScroll: () => void;
}

export const useSettingsStore = create<SettingsState>()((set) => ({
  shadows: true,
  showStats: false,
  edgeScroll: true,
  toggleShadows: () => set((state) => ({ shadows: !state.shadows })),
  toggleStats: () => set((state) => ({ showStats: !state.showStats })),
  toggleEdgeScroll: () => set((state) => ({ edgeScroll: !state.edgeScroll })),
}));
