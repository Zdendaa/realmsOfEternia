import type { ResourceCost } from '../resources/definitions.js';
import type { CombatStats } from './combat.js';

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
  /**
   * Research that unlocks it (a research id). Reserved for the technology tree (Phase 8);
   * nothing reads it yet.
   */
  requires?: string;
  /** The player can select it and give it orders (workers run on their own). */
  controllable: boolean;
  /** Health, armor and (for fighting units) the attack. */
  combat: CombatStats;
  /** Seconds a training building needs for one (soldiers); absent for villagers. */
  trainTime?: number;
  /** Paid to the player who kills one (monsters). */
  bounty?: ResourceCost;
}
