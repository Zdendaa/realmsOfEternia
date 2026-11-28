import { fractalNoise2D, smoothstep, valueNoise2D } from '../noise.js';
import { carveLakes, resolveLakes } from './water.js';
import { startSlotsOf } from './startSlots.js';
import type { MapDefinition } from './types.js';

/** Seed offsets so each noise layer is independent. */
const MOUNTAIN_SEED = 0x3a11;
const BORDER_JITTER_SEED = 0x7b02;
/** How far (±) the noise shifts the start of the border, so it isn't a straight line. */
const BORDER_JITTER = 8;
/** The border starts rising slightly inside the playable area, forming foothills. */
const BORDER_RAMP_START = -10;

export interface HeightField {
  /** Terrain height at world position (x, z). Deterministic; valid anywhere. */
  getHeightAt(x: number, z: number): number;
}

/** Chebyshev distance from the map center: square contours matching the square map. */
function distanceFromCenter(x: number, z: number): number {
  return Math.max(Math.abs(x), Math.abs(z));
}

/**
 * Builds the terrain height function for a map.
 *
 * The heightmap is never stored. It is computed from the map seed on demand, so the
 * client mesh, unit and building placement, and the server all agree without sending
 * terrain data over the network.
 *
 * Layout: rolling hills in the playable area with a flat plateau at every start slot, then
 * mountains rising across the border ring and continuing beyond.
 */
/**
 * The final terrain: natural height field with lakes carved in. Everything that samples
 * terrain should use this.
 */
export function createHeightField(map: MapDefinition): HeightField {
  const base = createBaseHeightField(map);
  return carveLakes(base, resolveLakes(map, base));
}

/** Natural terrain before water is carved in (hills, settlement plateau, border). */
export function createBaseHeightField(map: MapDefinition): HeightField {
  const { hillHeight, hillScale } = map.terrain;
  const { halfSize, blend } = map.settlement;
  const { width: borderWidth, mountainHeight } = map.border;
  const playableHalf = map.size / 2;

  // Lowlands near 0, hills only where the noise is high.
  const hills = (x: number, z: number) =>
    hillHeight * smoothstep(0.38, 0.85, fractalNoise2D(map.seed, x / hillScale, z / hillScale));

  // Ridged-looking mountain range: never below 40% of the peak height.
  const mountains = (x: number, z: number) => {
    const n = fractalNoise2D(map.seed + MOUNTAIN_SEED, x / 45, z / 45, 5);
    return mountainHeight * (0.4 + 0.6 * smoothstep(0.3, 0.75, n));
  };

  // Each settlement plateau sits at the natural ground level of its center.
  const plateaus = startSlotsOf(map).map(({ x, z }) => ({ x, z, level: hills(x, z) }));

  return {
    getHeightAt(x, z) {
      const fromCenter = distanceFromCenter(x, z);
      // Plateaus never overlap, so at most one shapes the ground here.
      let ground = hills(x, z);
      for (const plateau of plateaus) {
        const away = distanceFromCenter(x - plateau.x, z - plateau.z);
        if (away >= halfSize + blend) continue;
        const toSettlement = smoothstep(halfSize, halfSize + blend, away);
        ground = plateau.level + (ground - plateau.level) * toSettlement;
        break;
      }

      const jitter = (valueNoise2D(map.seed + BORDER_JITTER_SEED, x / 30, z / 30) - 0.5) * 2;
      const intoBorder = fromCenter - playableHalf + jitter * BORDER_JITTER;
      const toBorder = smoothstep(BORDER_RAMP_START, borderWidth * 0.8, intoBorder);
      if (toBorder === 0) return ground;

      return ground + (Math.max(ground, mountains(x, z)) - ground) * toBorder;
    },
  };
}

/** True if (x, z) lies inside a settlement plateau including its blend band. */
export function isInSettlementArea(map: MapDefinition, x: number, z: number): boolean {
  const reach = map.settlement.halfSize + map.settlement.blend;
  return startSlotsOf(map).some(
    (slot) => Math.abs(x - slot.x) < reach && Math.abs(z - slot.z) < reach,
  );
}

/** True if (x, z) lies inside the playable square. */
export function isInPlayableArea(map: MapDefinition, x: number, z: number): boolean {
  return distanceFromCenter(x, z) <= map.size / 2;
}
