import { smoothstep, valueNoise2D } from '../noise.js';
import type { HeightField } from './terrain.js';
import type { LakeDefinition, MapDefinition } from './types.js';

/** Seed offset for shoreline noise. */
const SHORE_SEED = 0x1a4e;
/** Band (relative to the radius) outside the shoreline where banks blend into terrain. */
const BANK_WIDTH = 0.45;
/** How far below the lowest surrounding ground the water surface sits. */
const LEVEL_BELOW_SHORE = 0.35;
/** Shore samples used to find the water level. */
const SHORE_SAMPLES = 64;

/** A lake with its derived water level. */
export interface Lake extends LakeDefinition {
  /** Water surface height (world units). */
  level: number;
  /** Seed for the shoreline noise (from the map). */
  seed: number;
}

/**
 * Normalized distance from the lake center, with a noisy shoreline:
 * 0 at the center, 1 on the shoreline.
 */
export function lakeDistance(lake: Lake, x: number, z: number): number {
  const angle = Math.atan2(z - lake.z, x - lake.x);
  // Sample the noise on a circle, so the shoreline wobbles but closes seamlessly.
  const wobble =
    valueNoise2D(lake.seed + SHORE_SEED, 3 + Math.cos(angle) * 1.6, 3 + Math.sin(angle) * 1.6) -
    0.5;
  const radius = lake.radius * (1 + wobble * 2 * lake.irregularity);
  return Math.hypot(x - lake.x, z - lake.z) / radius;
}

/**
 * Derives each lake's water level from the natural terrain: just below the lowest point
 * of its shoreline, so water can never spill over the banks.
 */
export function resolveLakes(map: MapDefinition, base: HeightField): Lake[] {
  return (map.water?.lakes ?? []).map((lake) => {
    let lowest = Infinity;
    for (let i = 0; i < SHORE_SAMPLES; i++) {
      const angle = (i / SHORE_SAMPLES) * Math.PI * 2;
      const x = lake.x + Math.cos(angle) * lake.radius;
      const z = lake.z + Math.sin(angle) * lake.radius;
      lowest = Math.min(lowest, base.getHeightAt(x, z));
    }
    return { ...lake, level: lowest - LEVEL_BELOW_SHORE, seed: map.seed };
  });
}

/**
 * Carves lake basins into a height field: a smooth bowl under the water, and banks that
 * slope down to just above the water level around the shoreline.
 */
export function carveLakes(base: HeightField, lakes: readonly Lake[]): HeightField {
  if (lakes.length === 0) return base;
  return {
    getHeightAt(x, z) {
      let height = base.getHeightAt(x, z);
      for (const lake of lakes) {
        const d = lakeDistance(lake, x, z);
        if (d >= 1 + BANK_WIDTH) continue;
        if (d < 1) {
          // Lake bed: deepest in the middle, dropping off quickly near the shore
          // (1 - d³), so there is no wide, milky shallow band.
          const bed = lake.level - lake.depth * (1 - d * d * d);
          height = Math.min(height, bed);
        } else {
          // Banks: pull the ground down toward just above the water level.
          const bank = lake.level + 0.25 + (d - 1) * 1.5;
          const t = smoothstep(1, 1 + BANK_WIDTH, d);
          height = Math.min(height, bank + (height - bank) * t);
        }
      }
      return height;
    },
  };
}

/** Water lookups shared by placement rules (client now, server later). */
export interface WaterMap {
  lakes: readonly Lake[];
  /** True on open water. `margin` grows the area (in lake-radius fractions). */
  isWater(x: number, z: number, margin?: number): boolean;
}

export function createWaterMap(map: MapDefinition, base: HeightField): WaterMap {
  const lakes = resolveLakes(map, base);
  return {
    lakes,
    isWater(x, z, margin = 0) {
      return lakes.some((lake) => lakeDistance(lake, x, z) < 1 + margin);
    },
  };
}
