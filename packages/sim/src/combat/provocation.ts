import { COMBAT_RULES, towerOf, UNITS, type AttackDefinition } from '@roe/game-data';
import { isInPlayableArea, type EntityId, type Vec2 } from '@roe/shared';
import type { SimContext } from '../context/simContext.js';
import { cellCenter, nearestWalkableCell } from '../nav/navGrid.js';
import type { BuildingInstance } from '../state/gameState.js';
import { isAlive, type UnitInstance } from '../state/units.js';
import { approachPoint, buildingReach } from './buildings.js';
import type { Projectile } from './projectiles.js';
import type { UnitGrid } from './targeting.js';

/**
 * Who is being shot by a tower, and by which: the targets of tower shots in flight, and
 * their comrades (same owner) standing close by, so a group reacts together instead of
 * trickling in as each is hit. Unit id → tower id.
 */
export function unitsUnderFire(
  projectiles: readonly Projectile[],
  units: ReadonlyMap<EntityId, UnitInstance>,
  buildings: ReadonlyMap<EntityId, BuildingInstance>,
  grid: UnitGrid,
): ReadonlyMap<EntityId, EntityId> {
  const shot = new Map<EntityId, EntityId>();
  const around: [UnitInstance, EntityId][] = [];
  for (const p of projectiles) {
    const shooter = buildings.get(p.attackerId);
    const victim = units.get(p.targetId);
    if (!shooter || !towerOf(shooter.type) || !victim || !isAlive(victim)) continue;
    shot.set(victim.id, shooter.id);
    around.push([victim, shooter.id]);
  }
  const reach = COMBAT_RULES.alarmRadius;
  for (const [victim, tower] of around) {
    const near = grid.query({
      minX: victim.x - reach,
      maxX: victim.x + reach,
      minZ: victim.z - reach,
      maxZ: victim.z + reach,
    });
    for (const ally of near) {
      const close = (ally.x - victim.x) ** 2 + (ally.z - victim.z) ** 2 <= reach * reach;
      if (close && ally.ownerId === victim.ownerId && !shot.has(ally.id)) shot.set(ally.id, tower);
    }
  }
  return shot;
}

/**
 * Whether a unit can do anything to a tower: it is in reach already, there is a way to
 * a spot it can attack from, or there is an enemy wall to break on the way. Made once
 * per tick: units of one owner in one area share the answer of the costly search.
 */
export function createReachCheck(ctx: SimContext) {
  const searched = new Map<string, boolean>();
  return (unit: UnitInstance, tower: BuildingInstance, attack: AttackDefinition): boolean => {
    const radius = UNITS[unit.type].radius;
    if (buildingReach(unit, radius, tower) <= attack.range) return true;
    const goal = approachPoint(unit, tower);
    const from = nearestWalkableCell(ctx.nav, unit.x, unit.z, unit.ownerId);
    const to = nearestWalkableCell(ctx.nav, goal.x, goal.z, unit.ownerId);
    if (from < 0) return false;
    const { of } = ctx.regions(unit.ownerId);
    // The walkable spot nearest the tower must be close enough to strike from.
    const spot = to < 0 ? null : cellCenter(ctx.nav, to);
    if (spot && of[from] === of[to] && buildingReach(spot, radius, tower) <= attack.range + 1) {
      return true;
    }
    // No open way: is there one through enemy walls?
    const key = `${unit.ownerId}:${of[from]}:${tower.id}`;
    let answer = searched.get(key);
    if (answer === undefined) {
      const through = ctx.paths.findPath(unit, goal, {
        passer: unit.ownerId,
        breach: true,
        maxExpansions: ctx.nav.flags.length,
      });
      answer = through.breach !== null || through.reachedGoal;
      searched.set(key, answer);
    }
    return answer;
  };
}

/** Whether the unit is already walking to a spot out of this tower's range. */
export function isRetreating(unit: UnitInstance, tower: BuildingInstance): boolean {
  const anchor = unit.combat?.anchor;
  const goal = unit.movement?.goal;
  const range = towerOf(tower.type)?.attack.range ?? 0;
  return (
    unit.task.kind === 'idle' &&
    unit.combat?.targetId === null &&
    !!anchor &&
    !!goal &&
    anchor.x === goal.x &&
    anchor.z === goal.z &&
    Math.hypot(anchor.x - tower.x, anchor.z - tower.z) > range
  );
}

/** Straight away from the tower, to a spot a little beyond its range. */
export function retreatPoint(ctx: SimContext, unit: Vec2, tower: BuildingInstance): Vec2 {
  const range = towerOf(tower.type)?.attack.range ?? 0;
  const dx = unit.x - tower.x;
  const dz = unit.z - tower.z;
  const length = Math.sqrt(dx * dx + dz * dz);
  const [ux, uz] = length > 0 ? [dx / length, dz / length] : [1, 0];
  // Closer in if the full distance would leave the map.
  for (let d = range + COMBAT_RULES.retreatMargin; d > length; d -= 1) {
    const point = { x: tower.x + ux * d, z: tower.z + uz * d };
    if (isInPlayableArea(ctx.world.map, point.x, point.z)) return point;
  }
  return { x: unit.x, z: unit.z };
}

/**
 * Whether a unit fighting back against `tower` is still on that business: within the
 * tower's range and a bit. Farther off, the usual leash applies again.
 */
export const nearShooter = (unit: Vec2, tower: BuildingInstance) =>
  Math.hypot(unit.x - tower.x, unit.z - tower.z) <=
  (towerOf(tower.type)?.attack.range ?? 0) + COMBAT_RULES.retreatMargin;
