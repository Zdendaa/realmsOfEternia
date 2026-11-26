/**
 * How dark the fog of war looks: all of it is tuned here (the fog pass reads it).
 * Visible ground is always untouched (1, 1) and unexplored ground black.
 */
export const FOG_LOOK = {
  /** Brightness of explored ground that is out of sight, as a share of the lit scene. */
  exploredLight: 0.72,
  /** How much color it keeps (0: grey, 1: full color). */
  exploredSaturation: 0.6,
} as const;
