import type { Decoration, DecorationKind, PlayerId } from '@roe/shared';
import { areAllies } from '../combat/hostility.js';
import { ensureVision, type SimContext } from '../context/simContext.js';
import { populationOf, type Population } from '../economy/population.js';
import { stockOf } from '../economy/stock.js';
import { cellCenterOf, nearestWalkableCell } from '../nav/navGrid.js';
import type { BuildingInstance, GameState } from '../state/gameState.js';
import { gatherReach, nodeById, nodesNear } from '../state/resourceNodes.js';
import { isAlive, type UnitInstance } from '../state/units.js';
import { viewOf } from '../vision/view.js';
import { buildingSeen, updateVision } from '../vision/vision.js';

/** The trees and rocks this close to its Town Hall are home ground: it always knows them. */
export const HOME_RADIUS = 45;

/**
 * What a computer player knows when it decides: what a human in its seat sees right now,
 * and the trees and rocks of its home ground. Managers get this, never the `GameState`,
 * so they can't use anything hidden by the fog. What it should remember from earlier has
 * to be kept in its `AiState`.
 */
export interface AiKnowledge {
  readonly player: PlayerId;
  readonly tick: number;
  readonly stock: ReturnType<typeof stockOf>;
  readonly population: Population;
  /** Its own living units. */
  readonly units: readonly UnitInstance[];
  /** Living allied units. */
  readonly allyUnits: readonly UnitInstance[];
  /** Living units of enemies and monsters in sight. */
  readonly enemyUnits: readonly UnitInstance[];
  /** Its own buildings and construction sites. */
  readonly buildings: readonly BuildingInstance[];
  /** Others' buildings in sight right now. */
  readonly otherBuildings: readonly BuildingInstance[];
  /** Its (first) finished Town Hall, or null when it has none. */
  readonly townHall: BuildingInstance | null;
  /** The kind of tree or rock with decoration id `id` (map knowledge). */
  readonly nodeKind: (id: number) => DecorationKind | undefined;
  /**
   * Up to `limit` home-ground trees or rocks with something left that its serfs can walk
   * up to, nearest to the Town Hall first.
   */
  readonly homeNodes: (kind: DecorationKind, limit: number) => Decoration[];
}

/**
 * `player`'s knowledge of `state`. Only what is in sight now is taken from the fog of
 * war: the vision's memory (explored ground, last-seen buildings) depends on how long
 * the context has run, so a restarted match could decide differently. `ctx` must be
 * synced with `state`.
 */
export function aiKnowledge(ctx: SimContext, state: GameState, player: PlayerId): AiKnowledge {
  const vision = ensureVision(ctx, player, state);
  updateVision(vision, state);
  const view = viewOf(ctx.world, state, vision);
  const units: UnitInstance[] = [];
  const allyUnits: UnitInstance[] = [];
  const enemyUnits: UnitInstance[] = [];
  for (const unit of view.units) {
    if (!isAlive(unit) || unit.ownerId === null) continue;
    if (unit.ownerId === player) units.push(unit);
    else if (areAllies(state.teams, player, unit.ownerId)) allyUnits.push(unit);
    else enemyUnits.push(unit);
  }
  const buildings = view.buildings.filter((b) => b.ownerId === player);
  const townHall = buildings.find((b) => b.type === 'townHall' && b.status === 'complete') ?? null;

  /** Whether a serf can get close enough to `node` to work on it. */
  const reachable = (node: Decoration) => {
    const cell = nearestWalkableCell(ctx.nav, node.x, node.z, player);
    if (cell < 0) return false;
    const regions = ctx.regions(player);
    if (regions.of[cell] !== regions.main) return false;
    const at = cellCenterOf(ctx.nav, cell % ctx.nav.cols, Math.floor(cell / ctx.nav.cols));
    return Math.hypot(at.x - node.x, at.z - node.z) <= gatherReach(node);
  };

  return {
    player,
    tick: state.tick,
    stock: stockOf(state, player),
    population: populationOf(state, player),
    units,
    allyUnits,
    enemyUnits,
    buildings,
    otherBuildings: view.buildings.filter((b) => b.ownerId !== player && buildingSeen(vision, b)),
    townHall,
    nodeKind: (id) => nodeById(ctx.world, id)?.kind,
    homeNodes: (kind, limit) => {
      if (!townHall) return [];
      const found: Decoration[] = [];
      for (const node of nodesNear(ctx.world, state.resourceNodes, kind, townHall, HOME_RADIUS)) {
        if (found.length >= limit) break;
        if (reachable(node)) found.push(node);
      }
      return found;
    },
  };
}
