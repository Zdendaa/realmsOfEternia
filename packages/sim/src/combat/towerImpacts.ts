import { combatOf, damageAgainst, towerOf, type TowerDefinition } from '@roe/game-data';
import { SIMULATION_TICK_RATE, type EntityId } from '@roe/shared';
import { applySlow, expireStatus } from '../heroes/status.js';
import { isAlive, type UnitInstance } from '../state/units.js';
import type { Hits } from './damage.js';
import { areEnemies } from './hostility.js';
import type { Projectile } from './projectiles.js';
import type { UnitGrid } from './targeting.js';

/** Damage of one tower hit on `unit` (bonuses and armor, unless the shot ignores armor). */
export function towerDamage(attack: TowerDefinition['attack'], unit: UnitInstance): number {
  const stats = combatOf(unit.type);
  return damageAgainst(attack, attack.ignoresArmor ? { ...stats, armor: 0 } : stats);
}

const ticks = (seconds: number) => Math.round(seconds * SIMULATION_TICK_RATE);

/**
 * What tower shots do as they land, beyond an arrow's plain damage: a slow on the unit
 * hit, or (for splash shots, which carry no damage of their own) damage to every enemy
 * around the point of impact, which may also set them burning. What a shot does is read
 * from the tower type it left from, so it works even if that tower has since fallen.
 * Mutates the unit working copies.
 */
export function applyTowerImpacts(
  landed: readonly Projectile[],
  byId: () => ReadonlyMap<EntityId, UnitInstance>,
  grid: () => UnitGrid,
  hits: Hits,
  tick: number,
): void {
  for (const p of landed) {
    const tower = p.source === undefined ? undefined : towerOf(p.source);
    if (!tower || (!tower.splash && !tower.slow)) continue;
    const target = byId().get(p.targetId);
    if (tower.slow && target && isAlive(target)) {
      applySlow(target, tower.slow.factor, tick + ticks(tower.slow.seconds));
    }
    if (!tower.splash) continue;
    // Around the target where it is now; where it was aimed at if it is gone.
    const center = target ?? p.aim;
    if (!center) continue;
    const { radius } = tower.splash;
    for (const unit of grid().query({
      minX: center.x - radius,
      maxX: center.x + radius,
      minZ: center.z - radius,
      maxZ: center.z + radius,
    })) {
      if (!isAlive(unit) || !areEnemies(p.ownerId, unit.ownerId)) continue;
      if ((unit.x - center.x) ** 2 + (unit.z - center.z) ** 2 > radius * radius) continue;
      hits.add(unit.id, towerDamage(tower.attack, unit), p.ownerId, p.attackerId);
      if (tower.burn) {
        // A new hit starts the fire over; fires don't stack.
        unit.burning = {
          until: tick + ticks(tower.burn.seconds),
          damage: tower.burn.damagePerSecond,
          by: p.ownerId,
        };
      }
    }
  }
}

/**
 * Burning units lose health once a second (armor doesn't help) until the fire goes out,
 * and slows wear off. Mutates the working copies.
 */
export function updateEffects(units: UnitInstance[], hits: Hits, tick: number): void {
  for (const unit of units) {
    if (unit.slowed && tick >= unit.slowed.until) unit.slowed = null;
    expireStatus(unit, tick);
    const fire = unit.burning;
    if (!fire) continue;
    if (tick >= fire.until) unit.burning = null;
    else if ((fire.until - tick) % SIMULATION_TICK_RATE === 0) {
      hits.add(unit.id, fire.damage, fire.by);
    }
  }
}
