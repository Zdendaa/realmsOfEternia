import { housingOf } from '@roe/game-data';
import type { PlayerId } from '@roe/shared';
import type { BuildingInstance, GameState } from '../state/gameState.js';
import { isAlive, type UnitInstance } from '../state/units.js';

/** A player's population: units alive and the housing for them. */
export interface Population {
  /** Every unit takes one place, heroes excepted. */
  used: number;
  /** Housing of the player's complete buildings (Town Hall, houses). */
  capacity: number;
}

/** Housing of `player`'s complete buildings. Construction sites house nobody yet. */
export function housingCapacity(
  buildings: readonly BuildingInstance[],
  player: PlayerId | null,
): number {
  if (player === null) return 0;
  let capacity = 0;
  for (const b of buildings) {
    if (b.ownerId === player && b.status === 'complete') capacity += housingOf(b.type);
  }
  return capacity;
}

/** Living units owned by `player` (the dead free their place right away). */
export function populationUsed(units: readonly UnitInstance[], player: PlayerId | null): number {
  if (player === null) return 0;
  let used = 0;
  for (const u of units) if (u.ownerId === player && isAlive(u) && !u.hero) used++;
  return used;
}

/**
 * `player`'s population, derived from the state (never stored, so it can't drift).
 * Neutral (null) has no population.
 */
export const populationOf = (state: GameState, player: PlayerId | null): Population => ({
  used: populationUsed(state.units, player),
  capacity: housingCapacity(state.buildings, player),
});

export const hasFreeHousing = (population: Population) => population.used < population.capacity;
