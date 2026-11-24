import type { HeightField } from '@roe/shared';
import { createPathFinder, type PathFinder } from '../nav/astar.js';
import { addBuilding, createNavGrid, stampBuildings, type NavGrid } from '../nav/navGrid.js';
import { toPlacedFootprint, type BuildingInstance, type GameState } from '../state/gameState.js';
import { createStateHeights } from '../state/stateHeights.js';
import type { SimWorld } from '../world/createWorld.js';

/**
 * Everything the simulation derives from the world and the current buildings: the
 * flattened terrain, the nav grid and a path finder. It's a cache, not state: client
 * and server each rebuild it from `GameState`, so it's never sent over the network.
 *
 * It's the one mutable piece of the simulation. `syncContext` keeps it in step with a
 * state's buildings; every function that takes a context expects it to be synced.
 */
export interface SimContext {
  readonly world: SimWorld;
  /** Terrain flattened under every building of the synced state. */
  heights: HeightField;
  readonly nav: NavGrid;
  readonly paths: PathFinder;
  /** The buildings array the context was last synced with. */
  buildings: readonly BuildingInstance[];
}

export function createSimContext(world: SimWorld, state: GameState): SimContext {
  const nav = createNavGrid(world);
  stampBuildings(nav, state.buildings.map(toPlacedFootprint));
  return {
    world,
    heights: createStateHeights(world, state),
    nav,
    paths: createPathFinder(nav),
    buildings: state.buildings,
  };
}

/**
 * Brings the context in line with `state`. Cheap when nothing changed (reference check).
 * New buildings are stamped incrementally; anything else rebuilds the building layer.
 * Returns true if the buildings changed.
 */
export function syncContext(ctx: SimContext, state: GameState): boolean {
  if (ctx.buildings === state.buildings) return false;
  const previous = ctx.buildings;
  const footprintsChanged =
    previous.length !== state.buildings.length ||
    previous.some((b, i) => state.buildings[i]?.id !== b.id);
  if (footprintsChanged) {
    const appended =
      state.buildings.length > previous.length &&
      previous.every((b, i) => state.buildings[i]?.id === b.id);
    if (appended) {
      for (const b of state.buildings.slice(previous.length))
        addBuilding(ctx.nav, toPlacedFootprint(b));
    } else {
      stampBuildings(ctx.nav, state.buildings.map(toPlacedFootprint));
    }
    ctx.heights = createStateHeights(ctx.world, state);
  }
  ctx.buildings = state.buildings;
  return footprintsChanged;
}
