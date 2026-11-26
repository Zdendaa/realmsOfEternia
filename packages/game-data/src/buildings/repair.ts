/** Serfs repairing damaged buildings (walls, gates and towers too). */
export const REPAIR_RULES = {
  /**
   * Hit points one serf restores per second. A swordsman does about 8 a second to a
   * building and a spearman about 18, so repairing slows an assault down but doesn't
   * easily undo one.
   */
  healthPerSecond: 5,
  /**
   * A repair from (nearly) destroyed costs this share of the building's cost, less
   * damage proportionally less, each resource rounded to the nearest whole unit. So
   * walls and light damage are free.
   */
  costShare: 0.25,
} as const;
