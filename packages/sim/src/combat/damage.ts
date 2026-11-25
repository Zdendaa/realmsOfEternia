import { COMBAT_RULES } from '@roe/game-data';
import { SIMULATION_TICK_RATE, type EntityId } from '@roe/shared';
import { IDLE, isAlive, type UnitInstance } from '../state/units.js';

/**
 * Damage dealt during one tick, summed per target and applied at once afterwards, so
 * the order in which attackers act within the tick doesn't matter.
 */
export class Hits {
  private readonly damage = new Map<EntityId, number>();

  add(targetId: EntityId, amount: number): void {
    this.damage.set(targetId, (this.damage.get(targetId) ?? 0) + amount);
  }

  get size(): number {
    return this.damage.size;
  }

  of(targetId: EntityId): number {
    return this.damage.get(targetId) ?? 0;
  }
}

/**
 * Applies the tick's hits to living units. A unit brought to 0 dies: it drops its task,
 * route, target and cargo and lies on the ground (`diedAt`) until `removeCorpses`.
 * Mutates the working copies.
 */
export function applyHits(units: UnitInstance[], hits: Hits, tick: number): void {
  if (hits.size === 0) return;
  for (const unit of units) {
    const damage = hits.of(unit.id);
    if (damage === 0 || !isAlive(unit)) continue;
    unit.health = Math.max(0, unit.health - damage);
    if (unit.health > 0) continue;
    unit.diedAt = tick;
    unit.task = IDLE;
    unit.movement = null;
    unit.activity = 'dying';
    unit.carrying = null;
    if (unit.combat) unit.combat = { ...unit.combat, targetId: null, strikeAt: null, anchor: null };
  }
}

const CORPSE_TICKS = Math.round(COMBAT_RULES.corpseSeconds * SIMULATION_TICK_RATE);

/** Units without the corpses that have lain long enough; the same array when none is due. */
export function removeCorpses(units: UnitInstance[], tick: number): UnitInstance[] {
  const due = (u: UnitInstance) => u.diedAt !== null && tick - u.diedAt >= CORPSE_TICKS;
  return units.some(due) ? units.filter((u) => !due(u)) : units;
}
