import { create } from 'zustand';

/** Client-only presentation settings. Never put authoritative game state here. */
interface SettingsState {
  shadows: boolean;
  showStats: boolean;
  /** Pan the camera when the pointer touches a screen edge (useful on trackpads). */
  edgeScroll: boolean;
  /** Health bars over every unit, not only hurt and selected ones (Alt shows them too). */
  allHealthBars: boolean;
  /** Development: draw the whole map as visible (fog of war off, for rendering only). */
  revealMap: boolean;
  /** Development: draw the fog of war as this computer player sees it (null: your own). */
  watchSeat: string | null;
  setWatchSeat: (player: string | null) => void;
  toggleShadows: () => void;
  toggleStats: () => void;
  toggleEdgeScroll: () => void;
  toggleAllHealthBars: () => void;
  toggleRevealMap: () => void;
}

export const useSettingsStore = create<SettingsState>()((set) => ({
  shadows: true,
  showStats: false,
  edgeScroll: true,
  allHealthBars: false,
  revealMap: false,
  watchSeat: null,
  setWatchSeat: (watchSeat) => set({ watchSeat }),
  toggleShadows: () => set((state) => ({ shadows: !state.shadows })),
  toggleStats: () => set((state) => ({ showStats: !state.showStats })),
  toggleEdgeScroll: () => set((state) => ({ edgeScroll: !state.edgeScroll })),
  toggleAllHealthBars: () => set((state) => ({ allHealthBars: !state.allHealthBars })),
  toggleRevealMap: () => set((state) => ({ revealMap: !state.revealMap })),
}));
