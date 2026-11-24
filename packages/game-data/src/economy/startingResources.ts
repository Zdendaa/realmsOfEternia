import type { ResourceAmounts } from '../resources/definitions.js';

/** Every player's stock at the start of a match. */
export const STARTING_RESOURCES = {
  wood: 30,
  stone: 20,
  iron: 0,
  gold: 5,
  food: 20,
  mana: 0,
} as const satisfies ResourceAmounts;
