import { smoothstep } from '../noise.js';
import type { HeightField } from './terrain.js';

/** Width × depth of a rectangular footprint, in world units. */
export interface Footprint {
  w: number;
  d: number;
}

/** A footprint placed in the world. `rotation` is around the Y axis, in radians. */
export interface PlacedFootprint {
  x: number;
  z: number;
  rotation: number;
  footprint: Footprint;
}

export interface FlattenOptions {
  /** Extra flat margin around each footprint, in world units. */
  padding: number;
  /** Width of the band where flat ground blends back into the original terrain. */
  blend: number;
}

const DEFAULT_FLATTEN: FlattenOptions = { padding: 1, blend: 5 };

interface PreparedArea {
  x: number;
  z: number;
  cos: number;
  sin: number;
  halfW: number;
  halfD: number;
  /** Squared radius beyond which the area has no influence (fast reject). */
  reachSq: number;
  blend: number;
  level: number;
}

/**
 * Converts a world point to a footprint's local axes (local X = width, local Z = depth).
 * Matches three.js `rotation.y` semantics.
 */
export function toFootprintLocal(area: PlacedFootprint, x: number, z: number) {
  const dx = x - area.x;
  const dz = z - area.z;
  const cos = Math.cos(area.rotation);
  const sin = Math.sin(area.rotation);
  return { lx: dx * cos - dz * sin, lz: dx * sin + dz * cos };
}

/** Distance from (x, z) to the footprint rectangle grown by `margin`; 0 inside. */
export function distanceToFootprint(area: PlacedFootprint, x: number, z: number, margin = 0) {
  const { lx, lz } = toFootprintLocal(area, x, z);
  const ox = Math.max(Math.abs(lx) - area.footprint.w / 2 - margin, 0);
  const oz = Math.max(Math.abs(lz) - area.footprint.d / 2 - margin, 0);
  return Math.hypot(ox, oz);
}

/**
 * Wraps a height field so the ground under each footprint is perfectly flat, then
 * blends smoothly back into the original terrain. Each area is levelled to the
 * original height at its center. Use it for buildings now and for player
 * construction later. The result is again a plain `HeightField`, so everything that
 * samples terrain (mesh, decorations, units, camera) sees the same flattened ground.
 */
export function flattenHeightField(
  base: HeightField,
  areas: readonly PlacedFootprint[],
  options: Partial<FlattenOptions> = {},
): HeightField {
  const { padding, blend } = { ...DEFAULT_FLATTEN, ...options };

  const prepared: PreparedArea[] = areas.map((area) => {
    const halfW = area.footprint.w / 2 + padding;
    const halfD = area.footprint.d / 2 + padding;
    const reach = Math.hypot(halfW, halfD) + blend;
    return {
      x: area.x,
      z: area.z,
      cos: Math.cos(area.rotation),
      sin: Math.sin(area.rotation),
      halfW,
      halfD,
      reachSq: reach * reach,
      blend,
      level: base.getHeightAt(area.x, area.z),
    };
  });

  return {
    getHeightAt(x, z) {
      // Inside a (padded) footprint that area's level wins outright, so a building
      // always stands on perfectly flat ground even when neighbours' blend bands
      // overlap it. Outside, overlapping blends are combined by weight.
      let maxWeight = 0;
      let weightSum = 0;
      let levelSum = 0;
      for (const a of prepared) {
        const dx = x - a.x;
        const dz = z - a.z;
        if (dx * dx + dz * dz > a.reachSq) continue;

        const lx = dx * a.cos - dz * a.sin;
        const lz = dx * a.sin + dz * a.cos;
        const outside = Math.hypot(
          Math.max(Math.abs(lx) - a.halfW, 0),
          Math.max(Math.abs(lz) - a.halfD, 0),
        );
        if (outside === 0) return a.level;

        const weight = 1 - smoothstep(0, a.blend, outside);
        if (weight <= 0) continue;
        maxWeight = Math.max(maxWeight, weight);
        weightSum += weight;
        levelSum += a.level * weight;
      }

      const height = base.getHeightAt(x, z);
      if (maxWeight === 0) return height;
      return height + (levelSum / weightSum - height) * maxWeight;
    },
  };
}
