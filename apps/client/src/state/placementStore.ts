import type { BuildingId } from '@roe/game-data';
import type { CommandCheck, PlaceBuildingCommand } from '@roe/sim';
import { create } from 'zustand';

/** Client-only UI state of the construction tool. Never sent to the server. */
interface PlacementStore {
  /** Building being placed, or null when not in placement mode. */
  selected: BuildingId | null;
  /** Rotation of the preview in 90° steps (0–3). */
  quarterTurns: number;
  /** The command a click would issue right now, and whether it would pass validation. */
  candidate: PlaceBuildingCommand | null;
  feedback: CommandCheck | null;
  select: (building: BuildingId | null) => void;
  rotate: () => void;
  setCandidate: (candidate: PlaceBuildingCommand | null, feedback: CommandCheck | null) => void;
}

export const usePlacementStore = create<PlacementStore>()((set) => ({
  selected: null,
  quarterTurns: 0,
  candidate: null,
  feedback: null,
  select: (building) => set({ selected: building, candidate: null, feedback: null }),
  rotate: () => set((s) => ({ quarterTurns: (s.quarterTurns + 1) % 4 })),
  setCandidate: (candidate, feedback) => set({ candidate, feedback }),
}));
