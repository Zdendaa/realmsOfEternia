import type { EntityId } from '@roe/shared';
import {
  buildingSeen,
  isExplored,
  isVisible,
  type BuildingInstance,
  type GameState,
  type Vision,
} from '@roe/sim';
import { LOCAL_PLAYER, useGameStore } from '../../state/gameStore';
import { useSettingsStore } from '../../state/settingsStore';

/**
 * Whose eyes the map is drawn through: the local player's, or in dev builds a watched
 * computer player's. Orders and panels stay the local player's either way.
 */
const viewer = () => useSettingsStore.getState().watchSeat ?? LOCAL_PLAYER;

/** The viewer's vision (fog of war), or null if the context keeps none. */
export const localVision = (): Vision | null =>
  useGameStore.getState().ctx.visions.get(viewer()) ?? null;

/** True when the fog is off for rendering (dev "Reveal map"), or there is no vision. */
const revealed = (vision: Vision | null) =>
  vision === null || useSettingsStore.getState().revealMap;

/** Whether the local player may see a thing of `owner` at (x, z) right now. */
export function shownAt(owner: string | null, x: number, z: number): boolean {
  if (owner === viewer()) return true;
  const vision = localVision();
  return revealed(vision) || isVisible(vision as Vision, x, z);
}

/**
 * Whether the local player sees `building` right now (own: always). Ghosts in the fog
 * can't be attacked, so the attack cursor needs this.
 */
export function buildingInSight(building: BuildingInstance): boolean {
  if (building.ownerId === viewer()) return true;
  const vision = localVision();
  return revealed(vision) || buildingSeen(vision as Vision, building);
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
  viewer: string;
  known: readonly BuildingInstance[];
} = { buildings: null, version: -1, reveal: false, viewer: LOCAL_PLAYER, known: [] };

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
  const eyes = viewer();
  if (
    cache.buildings === state.buildings &&
    cache.version === version &&
    cache.reveal === reveal &&
    cache.viewer === eyes
  ) {
    return cache.known;
  }
  let known: readonly BuildingInstance[];
  if (reveal || !vision) known = state.buildings;
  else {
    const own = state.buildings.filter((b) => b.ownerId === eyes);
    const seen = [...vision.lastSeen.values()].sort((a, b) => a.id - b.id);
    known = [...own, ...seen];
  }
  cache = { buildings: state.buildings, version, reveal, viewer: eyes, known };
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
