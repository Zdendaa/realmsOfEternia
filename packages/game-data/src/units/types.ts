import type { ResourceCost } from '../resources/definitions.js';

export interface UnitDefinition {
  id: string;
  name: string;
  description: string;
  /** Walking speed in world units per second. */
  speed: number;
  /** Collision radius used by separation, in world units. */
  radius: number;
  /**
   * Paid from the stock when the unit is recruited (workers arrive with their building
   * and cost nothing).
   */
  cost: ResourceCost;
  /** Hard upper limit of this unit type per player; housing usually limits first. */
  maxPerPlayer: number;
  /** The player can select it and give it orders (workers run on their own). */
  controllable: boolean;
}
