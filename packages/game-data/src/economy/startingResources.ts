import type { BuildingId } from '../buildings/definitions.js';
import type { ResourceAmounts } from '../resources/definitions.js';

/** Every player's stock at the start of a match. */
export const STARTING_RESOURCES = {
  wood: 30,
  stone: 20,
  iron: 0,
  gold: 5,
  food: 20,
  mana: 0,
  grain: 0,
  flour: 0,
} as const satisfies ResourceAmounts;

/**
 * Buildings where villagers drop off goods and pick up construction materials (the
 * nearest complete one of the owner). Goods count in the one global stock.
 */
export const STORAGE_BUILDINGS = [
  'townHall',
  'storehouse',
] as const satisfies readonly BuildingId[];
