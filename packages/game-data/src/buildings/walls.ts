/** Rules for drawing walls. Per-wall numbers (cost, health, …) are in `BUILDINGS`. */
export const WALL_RULES = {
  /**
   * Length of a straight segment in world units. A diagonal segment spans this much
   * along both axes, so every segment end stays on the 1-unit grid.
   */
  segmentLength: 2,
  /** Most segments one drawn line may have. */
  maxSegments: 64,
} as const;
