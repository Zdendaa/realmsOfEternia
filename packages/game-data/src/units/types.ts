export interface UnitDefinition {
  id: string;
  name: string;
  description: string;
  /** Walking speed in world units per second. */
  speed: number;
  /** Collision radius used by separation, in world units. */
  radius: number;
  /** Upper limit of this unit type per player (safety cap until housing exists). */
  maxPerPlayer: number;
}
