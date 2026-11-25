import type { BuildingId } from '@roe/game-data';
import type { CommandCheck, CutOff, PlaceBuildingCommand, PlacementIssue } from '@roe/sim';
import { create } from 'zustand';

/** What the wall line being dragged would do. */
export interface WallPreview {
  /** Segments a release would build. */
  count: number;
  /** Segments of the line that can't be built, and the first rule one of them fails. */
  blocked: number;
  blockedIssue: PlacementIssue | null;
  check: CommandCheck;
  cutOff: CutOff;
}

/** Client-only UI state of the construction tool. Never sent to the server. */
interface PlacementStore {
  /** Building being placed, or null when not in placement mode. */
  selected: BuildingId | null;
  /** Rotation of the preview in 90° steps (0–3). */
  quarterTurns: number;
  /** The command a click would issue right now, and whether it would pass validation. */
  candidate: PlaceBuildingCommand | null;
  feedback: CommandCheck | null;
  /** The wall line being dragged, or null when no drag is in progress. */
  wall: WallPreview | null;
  /** Kept after a wall is drawn that shuts something in, until the next drag. */
  wallWarning: CutOff | null;
  select: (building: BuildingId | null) => void;
  rotate: () => void;
  setCandidate: (candidate: PlaceBuildingCommand | null, feedback: CommandCheck | null) => void;
  setWall: (wall: WallPreview | null) => void;
  setWallWarning: (warning: CutOff | null) => void;
}

export const usePlacementStore = create<PlacementStore>()((set) => ({
  selected: null,
  quarterTurns: 0,
  candidate: null,
  feedback: null,
  wall: null,
  wallWarning: null,
  select: (building) =>
    set({ selected: building, candidate: null, feedback: null, wall: null, wallWarning: null }),
  rotate: () => set((s) => ({ quarterTurns: (s.quarterTurns + 1) % 4 })),
  setCandidate: (candidate, feedback) => set({ candidate, feedback }),
  setWall: (wall) => set({ wall }),
  setWallWarning: (wallWarning) => set({ wallWarning }),
}));
