import type { EntityId } from '@roe/shared';
import {
  isExplored,
  isVisible,
  type BuildingInstance,
  type GameState,
  type Vision,
} from '@roe/sim';
import { LOCAL_PLAYER, useGameStore } from '../../state/gameStore';
import { useSettingsStore } from '../../state/settingsStore';

/** The local player's vision (fog of war), or null if the context keeps none. */
export const localVision = (): Vision | null =>
  useGameStore.getState().ctx.visions.get(LOCAL_PLAYER) ?? null;

/** True when the fog is off for rendering (dev "Reveal map"), or there is no vision. */
const revealed = (vision: Vision | null) =>
  vision === null || useSettingsStore.getState().revealMap;

/** Whether the local player may see a thing of `owner` at (x, z) right now. */
export function shownAt(owner: string | null, x: number, z: number): boolean {
  if (owner === LOCAL_PLAYER) return true;
  const vision = localVision();
  return revealed(vision) || isVisible(vision as Vision, x, z);
}

/** Whether the local player has ever seen (x, z). */
export function exploredAt(x: number, z: number): boolean {
  const vision = localVision();
  return revealed(vision) || isExplored(vision as Vision, x, z);
}

let cache: {
  buildings: readonly BuildingInstance[] | null;
  version: number;
  reveal: boolean;
  known: readonly BuildingInstance[];
} = { buildings: null, version: -1, reveal: false, known: [] };

/**
 * The buildings the local player knows: their own as they are, and everyone else\'s as
 * last seen (current while in sight; ghosts in the fog, also of buildings destroyed out
 * of sight). Never-seen buildings are left out. Recomputed only when the buildings or
 * the vision change; the same array otherwise.
 */
export function knownBuildings(state: GameState): readonly BuildingInstance[] {
  const vision = localVision();
  const reveal = revealed(vision);
  const version = vision?.version ?? 0;
  if (cache.buildings === state.buildings && cache.version === version && cache.reveal === reveal) {
    return cache.known;
  }
  let known: readonly BuildingInstance[];
  if (reveal || !vision) known = state.buildings;
  else {
    const own = state.buildings.filter((b) => b.ownerId === LOCAL_PLAYER);
    const seen = [...vision.lastSeen.values()].sort((a, b) => a.id - b.id);
    known = [...own, ...seen];
  }
  cache = { buildings: state.buildings, version, reveal, known };
  return known;
}

/** Known building by id (for panels and picking). */
export const knownBuilding = (state: GameState, id: EntityId) =>
  knownBuildings(state).find((b) => b.id === id);

/** React hook: the known buildings, re-rendering when they change. */
export function useKnownBuildings(): readonly BuildingInstance[] {
  // Read with the state on every store change; the cache keeps the array stable.
  return useGameStore((s) => knownBuildings(s.state)) as readonly BuildingInstance[];
}
