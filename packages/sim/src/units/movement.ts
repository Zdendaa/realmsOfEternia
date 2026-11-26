import { UNITS } from '@roe/game-data';
import { SIMULATION_TICK_RATE, type Vec2 } from '@roe/shared';
import { createRoutePlanner } from '../combat/breaching.js';
import type { SimContext } from '../context/simContext.js';
import { boostOf, isStunned } from '../heroes/status.js';
import { hasLineOfSight } from '../nav/smoothPath.js';
import type { UnitInstance, UnitMovement } from '../state/units.js';

export const MOVEMENT_RULES = {
  /** Most path searches per tick; further requests wait for the next tick (oldest units first). */
  pathsPerTick: 24,
  /** Ticks without progress before a unit counts as stuck. */
  stuckTicks: 15,
  /** A stuck unit this close to its goal (path length) simply stops: the spot is crowded. */
  crowdedArrival: 2.5,
  /** Re-plans of a stuck unit before it gives up. */
  maxReplans: 2,
  /** Progress smaller than this (world units) doesn't count. */
  minProgress: 0.05,
} as const;

const TICK_SECONDS = 1 / SIMULATION_TICK_RATE;

/** Remaining route length from (x, z) through the waypoints still ahead. */
function remainingLength(x: number, z: number, waypoints: readonly Vec2[], next: number): number {
  let total = 0;
  let px = x;
  let pz = z;
  for (let i = next; i < waypoints.length; i++) {
    const w = waypoints[i] as Vec2;
    total += Math.sqrt((w.x - px) ** 2 + (w.z - pz) ** 2);
    px = w.x;
    pz = w.z;
  }
  return total;
}

/** Plans routes for units waiting for one, up to the per-tick budget, in state order. */
export function planPaths(ctx: SimContext, units: UnitInstance[]): void {
  let budget: number = MOVEMENT_RULES.pathsPerTick;
  const plan = createRoutePlanner(ctx);
  for (const unit of units) {
    if (budget === 0) return;
    const m = unit.movement;
    if (!m || m.waypoints) continue;
    budget--;
    const planned = plan(unit, m.goal);
    if (planned === 'later') continue;
    if ('breachId' in planned) {
      // The fighting code takes it from here: the wall is the target now.
      if (unit.combat) unit.combat = { ...unit.combat, breachId: planned.breachId };
      unit.movement = null;
      continue;
    }
    const { waypoints } = planned.route;
    // An empty route means the unit is already there, or nothing reachable exists.
    unit.movement = waypoints.length === 0 ? null : { ...m, waypoints, next: 0 };
  }
}

/**
 * After buildings changed, routes that now cross a blocked cell are dropped so the
 * planner re-plans them. Routes that stay clear are kept.
 */
export function invalidateBlockedRoutes(ctx: SimContext, units: UnitInstance[]): void {
  for (const unit of units) {
    const m = unit.movement;
    if (!m?.waypoints) continue;
    let from: Vec2 = unit;
    for (let i = m.next; i < m.waypoints.length; i++) {
      const to = m.waypoints[i] as Vec2;
      if (!hasLineOfSight(ctx.nav, from, to, unit.ownerId)) {
        unit.movement = { ...m, waypoints: null, next: 0 };
        break;
      }
      from = to;
    }
  }
}

/** Advances every unit with a route by one tick of walking. */
export function advanceUnits(units: UnitInstance[], tick: number): void {
  for (const unit of units) {
    const m = unit.movement;
    if (!m?.waypoints || isStunned(unit, tick)) continue;
    const slow = unit.slowed && tick < unit.slowed.until ? unit.slowed.factor : 1;
    const speed = UNITS[unit.type].speed * slow * boostOf(unit, 'speed', tick);
    unit.movement = walk(unit, m, speed * TICK_SECONDS);
  }
}

/** Moves `unit` along its route by `distance`; returns the updated movement or null on arrival. */
function walk(unit: UnitInstance, m: UnitMovement, distance: number): UnitMovement | null {
  const waypoints = m.waypoints as readonly Vec2[];
  let budget = distance;
  let next = m.next;
  while (budget > 0 && next < waypoints.length) {
    const w = waypoints[next] as Vec2;
    const dx = w.x - unit.x;
    const dz = w.z - unit.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d <= budget) {
      unit.x = w.x;
      unit.z = w.z;
      budget -= d;
      next++;
    } else {
      unit.x += (dx / d) * budget;
      unit.z += (dz / d) * budget;
      budget = 0;
    }
  }
  if (next >= waypoints.length) return null;

  const remaining = remainingLength(unit.x, unit.z, waypoints, next);
  if (remaining < m.bestDistance - MOVEMENT_RULES.minProgress) {
    return { ...m, next, bestDistance: remaining, stuckTicks: 0 };
  }
  const stuckTicks = m.stuckTicks + 1;
  if (stuckTicks < MOVEMENT_RULES.stuckTicks) return { ...m, next, stuckTicks };
  // Pushed around by other units for a while: stop if close, otherwise try another route.
  if (remaining < MOVEMENT_RULES.crowdedArrival) return null;
  if (m.replans >= MOVEMENT_RULES.maxReplans) return null;
  return {
    ...m,
    waypoints: null,
    next: 0,
    stuckTicks: 0,
    bestDistance: Infinity,
    replans: m.replans + 1,
  };
}
