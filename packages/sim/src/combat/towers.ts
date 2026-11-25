import { COMBAT_RULES, towerOf } from '@roe/game-data';
import { SIMULATION_TICK_RATE, type EntityId } from '@roe/shared';
import type { BuildingInstance } from '../state/gameState.js';
import { isAlive, type UnitInstance } from '../state/units.js';
import { areEnemies } from './hostility.js';
import { arrowFlight, type Projectile } from './projectiles.js';
import type { UnitGrid } from './targeting.js';
import { towerDamage } from './towerImpacts.js';

/** The tick each tower may shoot again, by building id; absent = ready. */
export type TowerCooldowns = Readonly<Record<EntityId, number>>;

/**
 * The enemy unit a tower at `tower` shoots: among those within `range` of its center,
 * first the ones in the middle of an attack, then the nearest; ties by id, so every
 * machine picks the same one. Null when none is in range.
 */
export function towerTarget(
  tower: Pick<BuildingInstance, 'x' | 'z' | 'ownerId'>,
  grid: UnitGrid,
  range: number,
): UnitInstance | null {
  let best: UnitInstance | null = null;
  let bestAttacking = false;
  let bestSq = Infinity;
  const candidates = grid.query({
    minX: tower.x - range,
    maxX: tower.x + range,
    minZ: tower.z - range,
    maxZ: tower.z + range,
  });
  for (const unit of candidates) {
    if (!isAlive(unit) || !areEnemies(tower.ownerId, unit.ownerId)) continue;
    const sq = (unit.x - tower.x) ** 2 + (unit.z - tower.z) ** 2;
    if (sq > range * range) continue;
    const attacking = unit.activity === 'attacking';
    const better =
      best === null ||
      (attacking && !bestAttacking) ||
      (attacking === bestAttacking && (sq < bestSq || (sq === bestSq && unit.id < best.id)));
    if (better) {
      best = unit;
      bestAttacking = attacking;
      bestSq = sq;
    }
  }
  return best;
}

/**
 * One tick of every finished tower: a ready one looks for a target (once per
 * `scanEvery` ticks, staggered by id) and releases an arrow, which then flies and hits
 * like an archer's. Returns the same cooldown record when nothing changed; cooldowns of
 * towers that no longer stand are dropped.
 */
export function updateTowers(
  tick: number,
  buildings: readonly BuildingInstance[],
  grid: () => UnitGrid,
  cooldowns: TowerCooldowns,
  projectiles: Projectile[],
  /** Towers being upgraded don't shoot. */
  upgrades: Readonly<Record<EntityId, unknown>> = {},
): TowerCooldowns {
  let next: Record<EntityId, number> | null = null;
  for (const tower of buildings) {
    const definition = towerOf(tower.type);
    if (!definition || tower.status !== 'complete' || upgrades[tower.id]) continue;
    if (tick < (cooldowns[tower.id] ?? 0) || (tick + tower.id) % COMBAT_RULES.scanEvery !== 0) {
      continue;
    }
    const { attack } = definition;
    const target = towerTarget(tower, grid(), attack.range);
    if (!target) continue;
    next ??= { ...cooldowns };
    next[tower.id] = tick + Math.max(1, Math.round(attack.cooldown * SIMULATION_TICK_RATE));
    projectiles.push({
      ...arrowFlight(tower, target, tick, attack.projectileSpeed ?? 1),
      attackerId: tower.id,
      ownerId: tower.ownerId,
      targetId: target.id,
      damage: definition.splash ? 0 : towerDamage(attack, target),
      fromHeight: definition.launchHeight,
      source: tower.type,
      aim: { x: target.x, z: target.z },
    });
  }
  const result = next ?? cooldowns;
  const gone = Object.keys(result).filter((id) => !buildings.some((b) => b.id === Number(id)));
  if (gone.length === 0) return result;
  return Object.fromEntries(Object.entries(result).filter(([id]) => !gone.includes(id)));
}
