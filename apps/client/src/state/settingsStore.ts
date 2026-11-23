import { create } from 'zustand';

/** Client-only presentation settings. Never put authoritative game state here. */
interface SettingsState {
  shadows: boolean;
  showStats: boolean;
  toggleShadows: () => void;
  toggleStats: () => void;
}

export const useSettingsStore = create<SettingsState>()((set) => ({
  shadows: true,
  showStats: false,
  toggleShadows: () => set((state) => ({ shadows: !state.shadows })),
  toggleStats: () => set((state) => ({ showStats: !state.showStats })),
}));
