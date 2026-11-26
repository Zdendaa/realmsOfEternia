import {
  abilityOf,
  HEROES,
  isHeroId,
  UNITS,
  type AbilityDefinition,
  type AbilityId,
} from '@roe/game-data';
import { isInPlayableArea, SIMULATION_TICK_RATE, type EntityId, type Vec2 } from '@roe/shared';
import { approachPoint, buildingReach } from '../combat/buildings.js';
import type { Hits } from '../combat/damage.js';
import { areEnemies } from '../combat/hostility.js';
import type { SimContext } from '../context/simContext.js';
import type { BuildingInstance } from '../state/gameState.js';
import { IDLE, isAlive, type CastTarget, type UnitInstance } from '../state/units.js';
import { moveTo } from '../units/orders.js';
import { maxHealthOf } from './heroes.js';
import { applyBoost, applySlow, applyStun, isStunned } from './status.js';

/** Heroes using their abilities: who may, walking into range, casting, and the effects. */

/** An ability that took effect, kept for a moment so every screen can show it. */
export interface Cast {
  tick: number;
  casterId: EntityId;
  ownerId: string;
  ability: AbilityId;
  /** Where its area is centered. */
  x: number;
  z: number;
}

/** A stretch of the map an ability shows to a player through the fog, until `until`. */
export interface Reveal {
  /** Negative (so it can't clash with a unit's or building's): one per caster. */
  id: EntityId;
  ownerId: string;
  x: number;
  z: number;
  radius: number;
  until: number;
}

/** How long a cast stays in the state (ticks). */
export const CAST_MEMORY = 2 * SIMULATION_TICK_RATE;
/** A hero walking to a point stops this close inside its range. */
const RANGE_SLACK = 0.01;

const ticks = (seconds: number) => Math.max(1, Math.round(seconds * SIMULATION_TICK_RATE));

/** A hero's abilities, in the order of their unlock levels. */
export const abilitiesOf = (unit: Pick<UnitInstance, 'type'>): readonly AbilityId[] =>
  isHeroId(unit.type) ? HEROES[unit.type].abilities : [];

export type AbilityIssue = 'noSuchAbility' | 'abilityLocked' | 'onCooldown';

/** Why the hero can't start `ability` now, or null when it can. */
export function abilityIssue(
  unit: UnitInstance,
  ability: AbilityId,
  tick: number,
): AbilityIssue | null {
  if (!unit.hero || !abilitiesOf(unit).includes(ability)) return 'noSuchAbility';
  if (unit.hero.level < abilityOf(ability).level) return 'abilityLocked';
  return tick < (unit.hero.cooldowns[ability] ?? 0) ? 'onCooldown' : null;
}

/** Where a cast is aimed and whether the hero is close enough to start it. */
function aim(
  unit: UnitInstance,
  definition: AbilityDefinition,
  target: CastTarget | null,
  buildings: ReadonlyMap<EntityId, BuildingInstance>,
): { center: Vec2; walkTo: Vec2; inRange: boolean; building?: BuildingInstance } | null {
  if (definition.target === 'self') {
    return { center: { x: unit.x, z: unit.z }, walkTo: unit, inRange: true };
  }
  if (!target) return null;
  if ('id' in target) {
    const building = buildings.get(target.id);
    if (!building || !areEnemies(unit.ownerId, building.ownerId)) return null;
    return {
      center: { x: building.x, z: building.z },
      walkTo: approachPoint(unit, building),
      inRange: buildingReach(unit, UNITS[unit.type].radius, building) <= definition.range,
      building,
    };
  }
  const distance = Math.sqrt((target.x - unit.x) ** 2 + (target.z - unit.z) ** 2);
  return { center: target, walkTo: target, inRange: distance <= definition.range + RANGE_SLACK };
}

/** Every effect of `definition`, around `center` (or on `building`). */
function takeEffect(
  caster: UnitInstance,
  definition: AbilityDefinition,
  center: Vec2,
  building: BuildingInstance | undefined,
  units: UnitInstance[],
  hits: Hits,
  tick: number,
): Reveal | null {
  const { radius } = definition;
  const inArea = units.filter(
    (u) => isAlive(u) && (u.x - center.x) ** 2 + (u.z - center.z) ** 2 <= radius * radius,
  );
  const allies = inArea.filter((u) => u.ownerId === caster.ownerId);
  const enemies = inArea.filter((u) => areEnemies(caster.ownerId, u.ownerId));
  let reveal: Reveal | null = null;
  for (const effect of definition.effects) {
    switch (effect.kind) {
      case 'damage':
        if (building) hits.add(building.id, effect.amount, caster.ownerId, caster.id);
        else for (const u of enemies) hits.add(u.id, effect.amount, caster.ownerId, caster.id);
        break;
      case 'heal':
        for (const u of allies) u.health = Math.min(maxHealthOf(u), u.health + effect.amount);
        break;
      case 'boost':
        for (const u of allies) {
          applyBoost(u, effect.stat, effect.factor, tick + ticks(effect.seconds));
        }
        break;
      case 'slow':
        for (const u of enemies) applySlow(u, effect.factor, tick + ticks(effect.seconds));
        break;
      case 'stun':
        for (const u of enemies) applyStun(u, tick + ticks(effect.seconds));
        break;
      case 'reveal':
        reveal = {
          id: -caster.id,
          ownerId: caster.ownerId as string,
          x: center.x,
          z: center.z,
          radius,
          until: tick + ticks(effect.seconds),
        };
        break;
    }
  }
  return reveal;
}

export interface Magic {
  casts: readonly Cast[];
  reveals: readonly Reveal[];
}

/**
 * One tick of every casting hero (state order): walk until in range, stand casting,
 * then apply the effects and start the cooldown. A hero that can't get into range, or
 * whose target is gone, gives up. A new order or a stun breaks off the casting without
 * spending anything. Old casts and reveals are dropped; the same arrays come back when
 * nothing changed. Mutates the unit working copies.
 */
export function updateAbilities(
  tick: number,
  units: UnitInstance[],
  buildings: readonly BuildingInstance[],
  hits: Hits,
  current: Magic,
): Magic {
  const casts: Cast[] = [];
  const reveals: Reveal[] = [];
  let byId: ReadonlyMap<EntityId, BuildingInstance> | null = null;
  for (const unit of units) {
    const task = unit.task;
    if (task.kind !== 'cast' || !isAlive(unit)) continue;
    if (isStunned(unit, tick)) {
      if (task.castAt !== null) unit.task = { ...task, castAt: null };
      continue;
    }
    const definition = abilityOf(task.ability);
    byId ??= new Map(buildings.map((b) => [b.id, b]));
    const at = aim(unit, definition, task.target, byId);
    const giveUp = () => {
      unit.task = IDLE;
      unit.movement = null;
      unit.activity = 'idle';
    };
    if (!at) {
      giveUp();
      continue;
    }
    if (task.castAt === null) {
      if (at.inRange) {
        unit.movement = null;
        unit.activity = 'casting';
        unit.task = { ...task, castAt: tick + ticks(definition.castTime) };
      } else if (unit.movement) unit.activity = 'walking';
      else if (unit.activity === 'walking') {
        // The walk ended short of the range: there is no getting there.
        giveUp();
      } else {
        // Casting was broken off (a stun) out of range: walk there again.
        unit.movement = moveTo(at.walkTo);
        unit.activity = 'walking';
      }
      continue;
    }
    unit.activity = 'casting';
    if (tick < task.castAt) continue;
    const reveal = takeEffect(unit, definition, at.center, at.building, units, hits, tick);
    if (reveal) reveals.push(reveal);
    casts.push({
      tick,
      casterId: unit.id,
      ownerId: unit.ownerId as string,
      ability: task.ability,
      x: at.center.x,
      z: at.center.z,
    });
    const hero = unit.hero as NonNullable<UnitInstance['hero']>;
    unit.hero = {
      ...hero,
      cooldowns: { ...hero.cooldowns, [task.ability]: tick + ticks(definition.cooldown) },
    };
    unit.task = IDLE;
    unit.activity = 'idle';
  }

  const fresh = (cast: Cast) => tick - cast.tick < CAST_MEMORY;
  const lasting = (reveal: Reveal) =>
    tick < reveal.until && !reveals.some((r) => r.id === reveal.id);
  return {
    casts:
      casts.length === 0 && current.casts.every(fresh)
        ? current.casts
        : [...current.casts.filter(fresh), ...casts],
    reveals:
      reveals.length === 0 && current.reveals.every(lasting)
        ? current.reveals
        : [...current.reveals.filter(lasting), ...reveals],
  };
}

/** Whether a chosen point is a legal place for an ability's area. */
export const isCastPoint = (ctx: SimContext, point: Vec2) =>
  isInPlayableArea(ctx.world.map, point.x, point.z);
