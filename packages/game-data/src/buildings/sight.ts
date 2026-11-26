/**
 * How far buildings see in the fog of war, in world units from the building's center:
 * all of it is tuned here. Units have their own `sight` (units/definitions.ts).
 */
export const BUILDING_SIGHT = {
  /** Buildings without their own `sight`. */
  default: 18,
  townHall: 28,
  /** Wall segments and gates: short, but a wall line lights up a band along itself. */
  wall: 8,
  /** Towers are the lookouts; each sees well beyond its range. */
  woodenTower: 22,
  stoneTower: 25,
  crossbowTower: 27,
  magicTower: 25,
  fireTower: 24,
} as const;
