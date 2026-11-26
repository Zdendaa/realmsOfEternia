import type { BoostStat } from '@roe/game-data';
import type { UnitInstance } from '../state/units.js';

/** Timed states a unit can be under: boosts, slows and stuns. */

/** Gives a boost; a new one of the same kind replaces the old (they don't stack). */
export function applyBoost(unit: UnitInstance, stat: BoostStat, factor: number, until: number) {
  unit.boosts = { ...unit.boosts, [stat]: { factor, until } };
}

/** The factor of a unit's boost of `stat` at `tick` (1 without one). */
export function boostOf(unit: Pick<UnitInstance, 'boosts'>, stat: BoostStat, tick: number): number {
  const boost = unit.boosts?.[stat];
  return boost && tick < boost.until ? boost.factor : 1;
}

/** A damage number under a factor, in whole numbers and never below 1. */
export const scaled = (amount: number, factor: number) =>
  factor === 1 ? amount : Math.max(1, Math.round(amount * factor));

/** Slows the unit. A slow in force that is at least as strong and lasts longer stays. */
export function applySlow(unit: UnitInstance, factor: number, until: number) {
  const current = unit.slowed;
  if (current && current.factor <= factor && current.until >= until) return;
  unit.slowed = { factor, until };
}

export const isStunned = (unit: Pick<UnitInstance, 'stunned'>, tick: number) =>
  unit.stunned !== null && tick < unit.stunned;

/** Stuns until `until` (a longer stun in force stays). */
export function applyStun(unit: UnitInstance, until: number) {
  unit.stunned = Math.max(unit.stunned ?? 0, until);
}

/** Drops boosts and stuns that have run out. */
export function expireStatus(unit: UnitInstance, tick: number) {
  if (unit.stunned !== null && tick >= unit.stunned) unit.stunned = null;
  if (!unit.boosts) return;
  const live = Object.entries(unit.boosts).filter(([, boost]) => tick < boost.until);
  if (live.length === Object.keys(unit.boosts).length) return;
  unit.boosts = live.length > 0 ? Object.fromEntries(live) : null;
}
