import {
  attackOf,
  BUILDING_COMBAT,
  combatOf,
  damageAgainst,
  towerOf,
  UNITS,
  type AttackDefinition,
} from '@roe/game-data';
import { distanceToFootprint, type Vec2 } from '@roe/shared';
import type { SimContext } from '../context/simContext.js';
import { isWalkable } from '../nav/navGrid.js';
import { hasLineOfSight } from '../nav/smoothPath.js';
import { toPlacedFootprint, type BuildingInstance } from '../state/gameState.js';
import { isAlive, type UnitInstance } from '../state/units.js';
import { buildingReach } from './buildings.js';
import type { Hits } from './damage.js';
import { areEnemies } from './hostility.js';
import type { Projectile } from './projectiles.js';
import type { UnitGrid } from './targeting.js';

/** What siege weapons do differently from soldiers. */

export const SIEGE_RULES = {
  /** Backing out of its minimum range, a unit goes this far beyond it. */
  backOffMargin: 1,
  /**
   * A catapult that can walk to within this much less than its range of its target goes
   * there and shoots over whatever is in between, instead of breaching.
   */
  overshootMargin: 1,
} as const;

/** Directions to try when backing off: straight away first, then turned (cos, sin). */
const H = Math.SQRT1_2;
const BACK_OFF_TURNS = [
  [1, 0],
  [H, H],
  [H, -H],
  [0, 1],
  [0, -1],
] as const;

/**
 * Whether a target at edge distance `reach` is too close to be hit. Only attacks with a
 * minimum range have a "too close" (overlapping units have a negative reach).
 */
export const tooClose = (attack: AttackDefinition, reach: number) =>
  attack.minRange !== undefined && reach < attack.minRange;

/**
 * The enemy building a siege weapon goes for on its own: within `sightRange` of it,
 * a tower before anything else, then the nearest, walls and gates included; ties by id.
 * Buildings inside its minimum range are passed over.
 */
export function findSiegeTarget(
  unit: UnitInstance,
  attack: AttackDefinition,
  buildings: readonly BuildingInstance[],
  sightRange: number,
): BuildingInstance | null {
  const radius = UNITS[unit.type].radius;
  let best: BuildingInstance | null = null;
  let bestTower = false;
  let bestDistance = Infinity;
  for (const building of buildings) {
    if (!areEnemies(unit.ownerId, building.ownerId)) continue;
    const distance = distanceToFootprint(toPlacedFootprint(building), unit.x, unit.z);
    if (distance > sightRange || tooClose(attack, distance - radius)) continue;
    const tower = towerOf(building.type) !== undefined;
    const better =
      best === null ||
      (tower && !bestTower) ||
      (tower === bestTower &&
        (distance < bestDistance || (distance === bestDistance && building.id < best.id)));
    if (better) {
      best = building;
      bestTower = tower;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * A clear spot away from `from` where a target now at edge distance `reach` is outside
 * the minimum range: straight back, or at an angle when something is behind. Null when
 * there is nowhere to go (the unit stands where it is).
 */
export function backOffPoint(
  ctx: SimContext,
  unit: UnitInstance,
  attack: AttackDefinition,
  from: Vec2,
  reach: number,
): Vec2 | null {
  const dx = unit.x - from.x;
  const dz = unit.z - from.z;
  const length = Math.sqrt(dx * dx + dz * dz);
  const [ux, uz] = length > 0 ? [dx / length, dz / length] : [1, 0];
  const step = (attack.minRange ?? 0) + SIEGE_RULES.backOffMargin - reach;
  for (const [cos, sin] of BACK_OFF_TURNS) {
    const point = {
      x: unit.x + (ux * cos - uz * sin) * step,
      z: unit.z + (ux * sin + uz * cos) * step,
    };
    if (
      isWalkable(ctx.nav, point.x, point.z, unit.ownerId) &&
      hasLineOfSight(ctx.nav, unit, point, unit.ownerId)
    ) {
      return point;
    }
  }
  return null;
}

/**
 * Splash shots of units landing this tick: every enemy unit and building around the
 * spot aimed at takes the hit (bonus and armor applied per target), whether or not the
 * original target is still there. The shooter's own side is not harmed.
 */
export function applySplashImpacts(
  landed: readonly Projectile[],
  grid: () => UnitGrid,
  buildings: readonly BuildingInstance[],
  hits: Hits,
): void {
  for (const p of landed) {
    const attack = p.weapon === undefined ? undefined : attackOf(p.weapon);
    if (!attack?.splash || !p.aim) continue;
    const { x, z } = p.aim;
    const { radius } = attack.splash;
    for (const unit of grid().query({
      minX: x - radius,
      maxX: x + radius,
      minZ: z - radius,
      maxZ: z + radius,
    })) {
      if (!isAlive(unit) || !areEnemies(p.ownerId, unit.ownerId)) continue;
      if ((unit.x - x) ** 2 + (unit.z - z) ** 2 > radius * radius) continue;
      hits.add(unit.id, damageAgainst(attack, combatOf(unit.type)), p.ownerId);
    }
    for (const building of buildings) {
      if (!areEnemies(p.ownerId, building.ownerId)) continue;
      if (buildingReach(p.aim, radius, building) > 0) continue;
      hits.add(building.id, damageAgainst(attack, BUILDING_COMBAT), p.ownerId);
    }
  }
}
