import {
  attackOf,
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
import { moveTo } from '../units/orders.js';
import type { Hits } from './damage.js';
import { areEnemies } from './hostility.js';
import { fireProjectile, type Projectile } from './projectiles.js';
import { createUnitGrid, edgeDistance, findTarget, type UnitGrid } from './targeting.js';

const ticks = (seconds: number) => Math.max(1, Math.round(seconds * SIMULATION_TICK_RATE));

/** An attack-mover this close to its own goal has arrived. */
const ARRIVED = 1;

const distance = (a: Vec2, b: Vec2) => Math.sqrt((a.x - b.x) ** 2 + (a.z - b.z) ** 2);

/** True when `unit` takes part in combat on its own this tick (fights and is alive). */
const isFighter = (unit: UnitInstance) => unit.combat !== null && isAlive(unit);

/**
 * A route straight at `target` when nothing blocks the line (the usual case in a
 * fight, and no path search), otherwise a request for the path planner.
 */
function chase(ctx: SimContext, unit: UnitInstance, target: Vec2): UnitMovement {
  const goal = { x: target.x, z: target.z };
  if (!hasLineOfSight(ctx.nav, unit, goal)) return moveTo(goal);
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
  hits: Hits,
  projectiles: Projectile[],
): void {
  if (!units.some(isFighter)) return;
  const grid: UnitGrid = createUnitGrid(units);
  const byId = new Map<EntityId, UnitInstance>();
  for (const u of units) byId.set(u.id, u);

  for (const unit of units) {
    if (!isFighter(unit)) continue;
    const attack = attackOf(unit.type) as AttackDefinition;
    const combat = { ...(unit.combat as UnitCombat) };
    unit.combat = combat;
    const task = unit.task;
    const wasEngaged = combat.targetId !== null;

    // A strike in progress lands (or misses) first, whatever happens to the target next.
    if (combat.strikeAt !== null && tick >= combat.strikeAt) {
      const target = combat.targetId !== null ? byId.get(combat.targetId) : undefined;
      if (target && isAlive(target)) strike(unit, attack, target, tick, hits, projectiles);
      combat.strikeAt = null;
    }

    // Which target this unit fights now.
    const current = combat.targetId !== null ? byId.get(combat.targetId) : undefined;
    let target =
      current && isAlive(current) && areEnemies(unit.ownerId, current.ownerId) ? current : null;
    if (task.kind === 'attack') {
      const ordered = byId.get(task.targetId);
      target = ordered && isAlive(ordered) ? ordered : null;
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
      target = findTarget(unit, grid, combatOf(unit.type).sightRange ?? 0);
      if (target && kind === 'idle' && !combat.anchor) combat.anchor = { x: unit.x, z: unit.z };
    }

    if (target) {
      combat.targetId = target.id;
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
  target: UnitInstance,
  tick: number,
): void {
  const reach = edgeDistance(unit, UNITS[unit.type].radius, target, UNITS[target.type].radius);
  if (reach <= attack.range || combat.strikeAt !== null) {
    unit.movement = null;
    if (combat.strikeAt === null && tick >= combat.readyAt) {
      combat.strikeAt = tick + ticks(attack.windup);
      combat.readyAt = tick + ticks(attack.cooldown);
    }
    unit.activity = 'attacking';
    return;
  }
  const m = unit.movement;
  if (!m || distance(m.goal, target) > COMBAT_RULES.repathDistance) {
    unit.movement = chase(ctx, unit, target);
  }
  unit.activity = 'walking';
}

/** The blow lands: melee damage now, or an arrow released toward the target. */
function strike(
  unit: UnitInstance,
  attack: AttackDefinition,
  target: UnitInstance,
  tick: number,
  hits: Hits,
  projectiles: Projectile[],
): void {
  const damage = damageAgainst(attack, combatOf(target.type));
  const reach = edgeDistance(unit, UNITS[unit.type].radius, target, UNITS[target.type].radius);
  if (reach > attack.range + COMBAT_RULES.strikeTolerance) return; // stepped away: a miss
  if (attack.kind === 'melee') hits.add(target.id, damage);
  else projectiles.push(fireProjectile(unit, target, tick, attack.projectileSpeed ?? 1, damage));
}
