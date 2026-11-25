import { COMBAT_RULES } from '@roe/game-data';
import { SIMULATION_TICK_RATE, type EntityId, type PlayerId } from '@roe/shared';
import { IDLE, isAlive, type UnitInstance } from '../state/units.js';

/**
 * Damage dealt during one tick, summed per target and applied at once afterwards, so
 * the order in which attackers act within the tick doesn't matter.
 */
export class Hits {
  private readonly damage = new Map<EntityId, number>();
  /** The owner of the last hit on each target this tick (state order: deterministic). */
  private readonly lastOwner = new Map<EntityId, PlayerId | null>();

  add(targetId: EntityId, amount: number, owner: PlayerId | null = null): void {
    this.damage.set(targetId, (this.damage.get(targetId) ?? 0) + amount);
    this.lastOwner.set(targetId, owner);
  }

  /** Who dealt the last hit on `targetId` this tick (it gets the credit for a kill). */
  killerOf(targetId: EntityId): PlayerId | null {
    return this.lastOwner.get(targetId) ?? null;
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
 * Mutates the working copies. Returns who died this tick and who killed them (the owner
 * of the last hit), for bounties.
 */
export function applyHits(
  units: UnitInstance[],
  hits: Hits,
  tick: number,
): { victim: UnitInstance; killer: PlayerId | null }[] {
  const deaths: { victim: UnitInstance; killer: PlayerId | null }[] = [];
  if (hits.size === 0) return deaths;
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
    deaths.push({ victim: unit, killer: hits.killerOf(unit.id) });
  }
  return deaths;
}

const CORPSE_TICKS = Math.round(COMBAT_RULES.corpseSeconds * SIMULATION_TICK_RATE);

/** Units without the corpses that have lain long enough; the same array when none is due. */
export function removeCorpses(units: UnitInstance[], tick: number): UnitInstance[] {
  const due = (u: UnitInstance) => u.diedAt !== null && tick - u.diedAt >= CORPSE_TICKS;
  return units.some(due) ? units.filter((u) => !due(u)) : units;
}
