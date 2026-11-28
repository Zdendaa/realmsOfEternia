import { BREACH_RULES, buildingHealthOf, isGate, isWall, isWalkableBuilding } from '@roe/game-data';
import { createVision, updateVision, type Vision } from '../vision/vision.js';
import type { HeightField, PlayerId } from '@roe/shared';
import { createPathFinder, type PathFinder } from '../nav/astar.js';
import {
  addBuilding,
  createNavGrid,
  removeDecoration,
  stampBuildings,
  type BuildingStamp,
  type NavGrid,
  type Passer,
} from '../nav/navGrid.js';
import { createRegionCache, type Regions } from '../nav/regions.js';
import type { Teams } from '../combat/hostility.js';
import { toPlacedFootprint, type BuildingInstance, type GameState } from '../state/gameState.js';
import type { NodeAmounts } from '../state/resourceNodes.js';
import { createStateHeights, flattens } from '../state/stateHeights.js';
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
  /** The nav grid's connected regions for a passer, recomputed after the grid changes. */
  readonly regions: (passer: Passer) => Regions;
  /** The teams of the synced state. */
  teams: Teams;
  /** The buildings array the context was last synced with. */
  buildings: readonly BuildingInstance[];
  /** The resource node amounts the context was last synced with. */
  resourceNodes: NodeAmounts;
  /** Ids of depleted nodes already cleared from the nav grid. */
  readonly depleted: Set<number>;
  /** Development build: dev-only commands (`debugSpawn`) are accepted. Never on the server. */
  readonly dev: boolean;
  /**
   * Fog of war: one vision per listed player (`SimContextOptions.visions`), updated at the
   * end of every tick. The client keeps its local player's; the server keeps everyone's.
   */
  readonly visions: Map<PlayerId, Vision>;
}

/** Starts keeping `player`'s vision (a player joining), up to date with `state`. */
export function ensureVision(ctx: SimContext, player: PlayerId, state: GameState): Vision {
  let vision = ctx.visions.get(player);
  if (!vision) {
    vision = createVision(ctx.world.map, player);
    updateVision(vision, state);
    ctx.visions.set(player, vision);
  }
  return vision;
}

/** Stops keeping `player`'s vision (a player leaving). */
export const dropVision = (ctx: SimContext, player: PlayerId) => ctx.visions.delete(player);

export interface SimContextOptions {
  /** Accept dev-only commands. Only the client's dev build sets it. */
  dev?: boolean;
  /** Players whose vision (fog of war) the context keeps. */
  visions?: readonly PlayerId[];
}

/** The player who may walk through `building`: a finished gate's owner, else nobody. */
const passableFor = (building: BuildingInstance) =>
  isGate(building.type) && building.status === 'complete' ? building.ownerId : null;

/** What it costs a breaching route to go through a cell of `building`. */
const wallCellOf = (building: Pick<BuildingInstance, 'id' | 'type' | 'ownerId'>) => ({
  id: building.id,
  owner: building.ownerId,
  cost: BREACH_RULES.cellCost + BREACH_RULES.costPerHealth * buildingHealthOf(building.type),
});

/** What the buildings put on the nav grid: every one except walkable ones (fields). */
export const buildingStamps = (buildings: readonly BuildingInstance[]): BuildingStamp[] =>
  buildings
    .filter((b) => !isWalkableBuilding(b.type))
    .map((b) => {
      const stamp: BuildingStamp = { area: toPlacedFootprint(b) };
      const gateOwner = passableFor(b);
      if (gateOwner !== null) stamp.gateOwner = gateOwner;
      if (isWall(b.type)) stamp.wall = wallCellOf(b);
      return stamp;
    });

/** True while two buildings put the same thing on the nav grid. */
const sameStamp = (a: BuildingInstance, b: BuildingInstance | undefined) =>
  a.id === b?.id && passableFor(a) === passableFor(b);

const sameIds = (a: readonly BuildingInstance[], b: readonly BuildingInstance[]) =>
  a.length === b.length && a.every((building, i) => b[i]?.id === building.id);

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
  stampBuildings(nav, buildingStamps(state.buildings));
  nav.teams = state.teams;
  return {
    world,
    heights: createStateHeights(world, state),
    nav,
    paths: createPathFinder(nav),
    regions: createRegionCache(nav),
    teams: state.teams,
    buildings: state.buildings,
    resourceNodes: state.resourceNodes,
    depleted,
    dev: options.dev ?? false,
    visions: new Map(
      (options.visions ?? []).map((player) => {
        const vision = createVision(world.map, player);
        updateVision(vision, state);
        return [player, vision];
      }),
    ),
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
    stampBuildings(ctx.nav, buildingStamps(state.buildings));
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
 * anything else (a building gone, a gate finished) rebuilds the building layer.
 * Newly depleted trees and rocks are cleared from the nav grid.
 * Returns true if the buildings changed.
 */
export function syncContext(ctx: SimContext, state: GameState): boolean {
  if (ctx.teams !== state.teams) {
    ctx.teams = state.teams;
    ctx.nav.teams = state.teams;
    ctx.nav.version++;
  }
  syncResourceNodes(ctx, state);
  if (ctx.buildings === state.buildings) return false;
  const previous = ctx.buildings;
  const footprintsChanged =
    previous.length !== state.buildings.length ||
    previous.some((b, i) => !sameStamp(b, state.buildings[i]));
  if (footprintsChanged) {
    const appended =
      state.buildings.length > previous.length &&
      previous.every((b, i) => sameStamp(b, state.buildings[i]));
    if (appended) {
      for (const stamp of buildingStamps(state.buildings.slice(previous.length))) {
        addBuilding(ctx.nav, stamp);
      }
    } else {
      stampBuildings(ctx.nav, buildingStamps(state.buildings));
    }
    // Walls don't shape the terrain: keep the same height field (renderers rebuild the
    // ground when it changes) while only walls were added or fell.
    if (!sameIds(previous.filter(flattens), state.buildings.filter(flattens))) {
      ctx.heights = createStateHeights(ctx.world, state);
    }
  }
  ctx.buildings = state.buildings;
  return footprintsChanged;
}
