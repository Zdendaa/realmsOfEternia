import type { Bounds2D, HeightField } from '@roe/shared';

/** How far around a footprint flattening can change the ground (padding 1 + blend 5 + 1). */
export const FLATTEN_REACH = 7;

/** Ground height for items, given their height in the generated world. */
export interface GroundLevel {
  at(x: number, z: number, generatedY: number): number;
  /** Areas where the terrain differs from the generated world (around new buildings). */
  changed: readonly Bounds2D[];
}

/** The generated world, before any player building. */
export const GENERATED_GROUND: GroundLevel = {
  at: (_x, _z, generatedY) => generatedY,
  changed: [],
};

export const boundsOverlap = (a: Bounds2D, b: Bounds2D) =>
  a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;

/**
 * Placing a building changes the terrain only near it. Items keep their generated
 * height unless they lie in a changed area, so re-seating thousands of trees and grass
 * patches after a placement needs only a handful of height lookups.
 */
export function createGroundLevel(heights: HeightField, changed: readonly Bounds2D[]): GroundLevel {
  if (changed.length === 0) return GENERATED_GROUND;
  return {
    changed,
    at: (x, z, generatedY) =>
      changed.some((b) => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ)
        ? heights.getHeightAt(x, z)
        : generatedY,
  };
}
