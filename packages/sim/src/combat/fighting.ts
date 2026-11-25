import {
  attackOf,
  BUILDING_COMBAT,
  COMBAT_RULES,
  combatOf,
  damageAgainst,
  UNITS,
  type AttackDefinition,
} from '@roe/game-data';
import { SIMULATION_TICK_RATE, type EntityId, type Vec2 } from '@roe/shared';
import type { SimContext } from '../context/simContext.js';
import { hasLineOfSight } from '../nav/smoothPath.js';
import {
  IDLE,
  isAlive,
  type UnitCombat,
  type UnitInstance,
  type UnitMovement,
} from '../state/units.js';
import type { BuildingInstance } from '../state/gameState.js';
import { moveTo } from '../units/orders.js';
import { approachPoint, buildingReach, findBuildingTarget } from './buildings.js';
import type { Hits } from './damage.js';
import { areEnemies } from './hostility.js';
import { fireProjectile, type Projectile } from './projectiles.js';
import { createUnitGrid, edgeDistance, findTarget, type UnitGrid } from './targeting.js';

/**
 * Seconds of an attack (windup, cooldown) in whole ticks, at least 1. Rendering uses it
 * to time attack animations exactly like the simulation.
 */
export const combatTicks = (seconds: number) =>
  Math.max(1, Math.round(seconds * SIMULATION_TICK_RATE));

/** An attack-mover this close to its own goal has arrived. */
const ARRIVED = 1;

const distance = (a: Vec2, b: Vec2) => Math.sqrt((a.x - b.x) ** 2 + (a.z - b.z) ** 2);

/** True when `unit` takes part in combat on its own this tick (fights and is alive). */
const isFighter = (unit: UnitInstance) => unit.combat !== null && isAlive(unit);

/** What a unit can fight: an enemy unit, or an enemy building (or construction site). */
type Foe =
  { unit: UnitInstance; building?: undefined } | { unit?: undefined; building: BuildingInstance };

const foeId = (foe: Foe) => (foe.unit ?? foe.building).id;
const ownerOf = (foe: Foe) => (foe.unit ?? foe.building).ownerId;

/** Distance from `unit`'s edge to the foe's edge (radius or footprint). */
function reachTo(unit: UnitInstance, foe: Foe): number {
  const radius = UNITS[unit.type].radius;
  return foe.unit
    ? edgeDistance(unit, radius, foe.unit, UNITS[foe.unit.type].radius)
    : buildingReach(unit, radius, foe.building);
}

/** Where to walk to reach the foe: the unit itself, or the near side of the building. */
const goalFor = (unit: UnitInstance, foe: Foe): Vec2 =>
  foe.unit ?? approachPoint(unit, foe.building);

/**
 * A foe by entity id (units and buildings share the id space): living units and standing
 * buildings only.
 */
function lookup(
  id: EntityId | null,
  units: ReadonlyMap<EntityId, UnitInstance>,
  buildings: ReadonlyMap<EntityId, BuildingInstance>,
): Foe | null {
  if (id === null) return null;
  const unit = units.get(id);
  if (unit) return isAlive(unit) ? { unit } : null;
  const building = buildings.get(id);
  return building ? { building } : null;
}

/**
 * A route straight at `target` when nothing blocks the line (the usual case in a
 * fight, and no path search), otherwise a request for the path planner.
 */
function chase(ctx: SimContext, unit: UnitInstance, target: Vec2): UnitMovement {
  const goal = { x: target.x, z: target.z };
  if (!hasLineOfSight(ctx.nav, unit, goal, unit.ownerId)) return moveTo(goal);
  return { ...moveTo(goal), waypoints: [goal] };
}

/**
 * One tick of every fighting unit (state order): pick or keep a target, chase it,
 * strike when in reach and ready, release arrows; attack-movers walk on between fights,
 * and units that engaged on their own walk back when the fight is over or the chase
 * went too far. Damage goes to `hits`, new arrows to `projectiles`. Mutates the working
 * copies.
 *
 * Who looks for enemies on their own: idle units (except while walking back) and
 * attack-movers, once every `COMBAT_RULES.scanEvery` ticks (staggered by id). Units on a
 * plain move ignore enemies.
 */
export function updateFighters(
  ctx: SimContext,
  tick: number,
  units: UnitInstance[],
  buildings: readonly BuildingInstance[],
  hits: Hits,
  projectiles: Projectile[],
): void {
  if (!units.some(isFighter)) return;
  const grid: UnitGrid = createUnitGrid(units);
  const byId = new Map<EntityId, UnitInstance>();
  for (const u of units) byId.set(u.id, u);
  const buildingsById = new Map(buildings.map((b) => [b.id, b]));
  const find = (id: EntityId | null) => lookup(id, byId, buildingsById);

  for (const unit of units) {
    if (!isFighter(unit)) continue;
    const attack = attackOf(unit.type) as AttackDefinition;
    const combat = { ...(unit.combat as UnitCombat) };
    unit.combat = combat;
    const task = unit.task;
    const wasEngaged = combat.targetId !== null;

    // A strike in progress lands (or misses) first, whatever happens to the target next.
    if (combat.strikeAt !== null && tick >= combat.strikeAt) {
      const target = find(combat.targetId);
      if (target) strike(unit, attack, target, tick, hits, projectiles);
      combat.strikeAt = null;
    }

    // Which target this unit fights now.
    const current = find(combat.targetId);
    let target: Foe | null = current && areEnemies(unit.ownerId, ownerOf(current)) ? current : null;
    if (task.kind === 'attack') {
      target = find(task.targetId);
      if (!target) {
        // The ordered target is dead or gone: stand here and react to what comes next.
        unit.task = IDLE;
        unit.movement = null;
        combat.anchor = null;
      }
    } else if (task.kind !== 'idle' && task.kind !== 'attackMove') {
      target = null;
    }

    const kind = unit.task.kind;
    const returning = kind === 'idle' && combat.anchor !== null && !wasEngaged && unit.movement;
    // Chased too far from where it engaged on its own: give up (and don't pick the same
    // enemy again right away; the walk back starts below).
    const leashed =
      target !== null &&
      kind === 'idle' &&
      combat.anchor !== null &&
      distance(unit, combat.anchor) > COMBAT_RULES.leash;
    if (leashed) target = null;
    if (
      !target &&
      !returning &&
      !leashed &&
      (kind === 'idle' || kind === 'attackMove') &&
      (tick + unit.id) % COMBAT_RULES.scanEvery === 0
    ) {
      // Enemy units first; enemy buildings when no unit is in sight.
      const sight = combatOf(unit.type).sightRange ?? 0;
      const foe = findTarget(unit, grid, sight);
      const building = foe ? null : findBuildingTarget(unit, buildings, sight);
      target = foe ? { unit: foe } : building ? { building } : null;
      if (target && kind === 'idle' && !combat.anchor) {
        // Guards are leashed to their home spot; others to where they engaged.
        combat.anchor = combat.home ?? { x: unit.x, z: unit.z };
      }
    }

    if (target) {
      combat.targetId = foeId(target);
      engage(ctx, unit, combat, attack, target, tick);
      continue;
    }

    // No target this tick.
    combat.targetId = null;
    combat.strikeAt = null;
    if (unit.task.kind === 'attackMove') {
      const goal = { x: unit.task.x, z: unit.task.z };
      // After a fight the walk resumes; a walk that ended (arrived, or gave up) is done.
      if (wasEngaged && distance(unit, goal) > ARRIVED) unit.movement = moveTo(goal);
      else if (!unit.movement) unit.task = IDLE;
    } else if (unit.task.kind === 'idle' && combat.anchor) {
      if (wasEngaged) {
        unit.movement = distance(unit, combat.anchor) > ARRIVED ? moveTo(combat.anchor) : null;
      }
      if (!unit.movement) combat.anchor = null;
    } else if (unit.task.kind === 'move' && !unit.movement) {
      unit.task = IDLE;
    }
    unit.activity = unit.movement ? 'walking' : 'idle';
  }
}

/** Chases `target` until in reach, then attacks whenever the cooldown allows. */
function engage(
  ctx: SimContext,
  unit: UnitInstance,
  combat: UnitCombat,
  attack: AttackDefinition,
  target: Foe,
  tick: number,
): void {
  const reach = reachTo(unit, target);
  if (reach <= attack.range || combat.strikeAt !== null) {
    unit.movement = null;
    if (combat.strikeAt === null && tick >= combat.readyAt) {
      combat.strikeAt = tick + combatTicks(attack.windup);
      combat.readyAt = tick + combatTicks(attack.cooldown);
    }
    unit.activity = 'attacking';
    return;
  }
  const goal = goalFor(unit, target);
  const m = unit.movement;
  if (!m || distance(m.goal, goal) > COMBAT_RULES.repathDistance) {
    unit.movement = chase(ctx, unit, goal);
  }
  unit.activity = 'walking';
}

/** The blow lands: melee damage now, or an arrow released toward the target. */
function strike(
  unit: UnitInstance,
  attack: AttackDefinition,
  target: Foe,
  tick: number,
  hits: Hits,
  projectiles: Projectile[],
): void {
  const damage = damageAgainst(attack, target.unit ? combatOf(target.unit.type) : BUILDING_COMBAT);
  if (reachTo(unit, target) > attack.range + COMBAT_RULES.strikeTolerance) return; // a miss
  const id = foeId(target);
  if (attack.kind === 'melee') hits.add(id, damage, unit.ownerId);
  else {
    const at = target.unit ?? target.building;
    projectiles.push(fireProjectile(unit, id, at, tick, attack.projectileSpeed ?? 1, damage));
  }
}
