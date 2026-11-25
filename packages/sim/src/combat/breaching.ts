import type { EntityId, Vec2 } from '@roe/shared';
import type { SimContext } from '../context/simContext.js';
import type { PathResult } from '../nav/astar.js';
import { cellIndexAt, isWalkableCell, nearestWalkableCell } from '../nav/navGrid.js';
import type { UnitInstance } from '../state/units.js';

export const BREACH_PLANNING = {
  /** Most new breach searches per tick (they cover the whole map); others wait a tick. */
  searchesPerTick: 3,
  /**
   * Attackers starting within the same square of this size, heading into the same one,
   * take the same segment: one search for the group, and they gang up on it.
   */
  shareSize: 8,
  /** A fighter's route ending farther than this from its goal counts as no way there. */
  shortOfGoal: 1.5,
} as const;

/** Fighters on their way to a fight break walls; a plain move never does. */
const breaches = (unit: UnitInstance) =>
  unit.combat !== null &&
  (unit.task.kind === 'attackMove' || unit.task.kind === 'attack' || unit.combat.targetId !== null);

/** Whether a route ends well short of its goal. */
function fallsShort(unit: Vec2, goal: Vec2, route: PathResult): boolean {
  const end = route.waypoints.at(-1) ?? unit;
  return (end.x - goal.x) ** 2 + (end.z - goal.z) ** 2 > BREACH_PLANNING.shortOfGoal ** 2;
}

/**
 * The search for a way through enemy walls, over the whole grid. It starts from the end
 * in the smaller connected area (usually the enclosure being broken into).
 */
export function findWayThrough(ctx: SimContext, unit: UnitInstance, goal: Vec2): PathResult {
  const passer = unit.ownerId;
  const { of, sizes } = ctx.regions(passer);
  const sizeAt = (p: Vec2) => {
    const cell = nearestWalkableCell(ctx.nav, p.x, p.z, passer);
    return cell < 0 ? Infinity : (sizes[of[cell] as number] ?? Infinity);
  };
  return ctx.paths.findPath(unit, goal, {
    passer,
    breach: true,
    maxExpansions: ctx.nav.flags.length,
    fromGoal: sizeAt(goal) < sizeAt(unit),
  });
}

/** The goal is a walkable spot in another region: no walking there, no need to search. */
function cutOff(ctx: SimContext, unit: UnitInstance, goal: Vec2): boolean {
  const goalCell = cellIndexAt(ctx.nav, goal.x, goal.z);
  if (!isWalkableCell(ctx.nav, goalCell, unit.ownerId)) return false;
  const start = nearestWalkableCell(ctx.nav, unit.x, unit.z, unit.ownerId);
  if (start < 0) return false;
  const { of } = ctx.regions(unit.ownerId);
  return of[start] !== of[goalCell];
}

const squareOf = (p: Vec2) =>
  `${Math.floor(p.x / BREACH_PLANNING.shareSize)},${Math.floor(p.z / BREACH_PLANNING.shareSize)}`;

/** What planning decided: a route to walk, a wall to break, or "ask again next tick". */
export type Planned = { route: PathResult } | { breachId: EntityId } | 'later';

/**
 * Route planning for one tick. For a fighter with no way to its goal, it looks for one
 * through the enemy's walls and names the first segment to break. Walking around always
 * costs less than breaking through, so walls are only chosen when there is no way.
 * The shared choices and the budget live for one tick: nothing carries over.
 */
export function createRoutePlanner(ctx: SimContext) {
  const shared = new Map<string, EntityId>();
  let searches: number = BREACH_PLANNING.searchesPerTick;

  return function plan(unit: UnitInstance, goal: Vec2): Planned {
    const passer = unit.ownerId;
    const walk = () => ctx.paths.findPath(unit, goal, { passer });
    if (!breaches(unit)) return { route: walk() };

    let route: PathResult | null = null;
    if (!cutOff(ctx, unit, goal)) {
      route = walk();
      if (!fallsShort(unit, goal, route)) return { route };
    }
    const key = `${passer}:${squareOf(unit)}:${squareOf(goal)}`;
    const known = shared.get(key);
    if (known !== undefined) return { breachId: known };
    if (searches === 0) return 'later';
    searches--;
    const through = findWayThrough(ctx, unit, goal);
    if (through.breach !== null) {
      shared.set(key, through.breach);
      return { breachId: through.breach };
    }
    // No wall helps: a way the first search gave up on, or as close as it gets.
    return { route: through.reachedGoal ? through : (route ?? walk()) };
  };
}
