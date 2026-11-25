import { isWalkableBuilding } from '@roe/game-data';
import type { HeightField, PlacedFootprint } from '@roe/shared';
import { createPathFinder, type PathFinder } from '../nav/astar.js';
import {
  addBuilding,
  createNavGrid,
  removeDecoration,
  stampBuildings,
  type NavGrid,
} from '../nav/navGrid.js';
import { toPlacedFootprint, type BuildingInstance, type GameState } from '../state/gameState.js';
import type { NodeAmounts } from '../state/resourceNodes.js';
import { createStateHeights } from '../state/stateHeights.js';
import type { SimWorld } from '../world/createWorld.js';

/**
 * Everything the simulation derives from the world, the current buildings and the
 * depleted trees and rocks: the flattened terrain, the nav grid and a path finder. It's a cache, not state: client
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
  /** The resource node amounts the context was last synced with. */
  resourceNodes: NodeAmounts;
  /** Ids of depleted nodes already cleared from the nav grid. */
  readonly depleted: Set<number>;
  /** Development build: dev-only commands (`debugSpawn`) are accepted. Never on the server. */
  readonly dev: boolean;
}

export interface SimContextOptions {
  /** Accept dev-only commands. Only the client's dev build sets it. */
  dev?: boolean;
}

/** Footprints that block walking: every building except walkable ones (fields). */
const blockingFootprints = (buildings: readonly BuildingInstance[]): PlacedFootprint[] =>
  buildings.filter((b) => !isWalkableBuilding(b.type)).map(toPlacedFootprint);

const depletedIds = (nodes: NodeAmounts) =>
  Object.entries(nodes)
    .filter(([, amount]) => amount === 0)
    .map(([id]) => Number(id));

export function createSimContext(
  world: SimWorld,
  state: GameState,
  options: SimContextOptions = {},
): SimContext {
  const depleted = new Set(depletedIds(state.resourceNodes));
  const nav = createNavGrid(world, (id) => depleted.has(id));
  stampBuildings(nav, blockingFootprints(state.buildings));
  return {
    world,
    heights: createStateHeights(world, state),
    nav,
    paths: createPathFinder(nav),
    buildings: state.buildings,
    resourceNodes: state.resourceNodes,
    depleted,
    dev: options.dev ?? false,
  };
}

/**
 * Clears newly depleted nodes from the nav grid. Depletion only ever grows within a
 * match; if the state lost a depleted node (a different state was synced), the whole
 * decoration layer is rebuilt.
 */
function syncResourceNodes(ctx: SimContext, state: GameState): void {
  if (ctx.resourceNodes === state.resourceNodes) return;
  const now = depletedIds(state.resourceNodes);
  const nowSet = new Set(now);
  const isGone = (id: number) => nowSet.has(id);
  if ([...ctx.depleted].some((id) => !nowSet.has(id))) {
    const fresh = createNavGrid(ctx.world, isGone);
    ctx.nav.flags.set(fresh.flags);
    stampBuildings(ctx.nav, blockingFootprints(state.buildings));
    ctx.depleted.clear();
  }
  for (const id of now) {
    if (ctx.depleted.has(id)) continue;
    const node = ctx.world.decorations[id];
    if (node) removeDecoration(ctx.nav, ctx.world, node, isGone);
    ctx.depleted.add(id);
  }
  ctx.resourceNodes = state.resourceNodes;
}

/**
 * Brings the context in line with `state`. Cheap when nothing changed (reference checks).
 * New buildings are stamped incrementally (walkable ones, i.e. fields, never block);
 * anything else rebuilds the building layer.
 * Newly depleted trees and rocks are cleared from the nav grid.
 * Returns true if the buildings changed.
 */
export function syncContext(ctx: SimContext, state: GameState): boolean {
  syncResourceNodes(ctx, state);
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
      for (const f of blockingFootprints(state.buildings.slice(previous.length))) {
        addBuilding(ctx.nav, f);
      }
    } else {
      stampBuildings(ctx.nav, blockingFootprints(state.buildings));
    }
    ctx.heights = createStateHeights(ctx.world, state);
  }
  ctx.buildings = state.buildings;
  return footprintsChanged;
}
