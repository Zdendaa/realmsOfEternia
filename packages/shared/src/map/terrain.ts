import { fractalNoise2D, smoothstep } from '../noise.js';
import type { MapDefinition } from './types.js';

/** Width of the band along the map border where hills fade down to height 0. */
const EDGE_FADE = 16;

export interface HeightField {
  /** Terrain height at world position (x, z). Deterministic; valid anywhere. */
  getHeightAt(x: number, z: number): number;
}

/**
 * Builds the terrain height function for a map.
 *
 * The heightmap is never stored. It is computed from the map seed on demand, so the
 * client mesh, unit and building placement, and the server all agree without sending
 * terrain data over the network.
 */
export function createHeightField(map: MapDefinition): HeightField {
  const { hillHeight, hillScale } = map.terrain;
  const { halfSize, blend } = map.settlement;
  const mapHalf = map.size / 2;

  // Lowlands near 0, hills only where the noise is high.
  const hills = (x: number, z: number) =>
    hillHeight * smoothstep(0.38, 0.85, fractalNoise2D(map.seed, x / hillScale, z / hillScale));

  // The settlement plateau sits at the natural ground level of the map center.
  const settlementLevel = hills(0, 0);

  return {
    getHeightAt(x, z) {
      // Chebyshev distance gives a square plateau aligned with the building grid.
      const fromCenter = Math.max(Math.abs(x), Math.abs(z));
      const toSettlement = smoothstep(halfSize, halfSize + blend, fromCenter);
      const height = settlementLevel + (hills(x, z) - settlementLevel) * toSettlement;

      const toEdge = 1 - smoothstep(mapHalf - EDGE_FADE, mapHalf, fromCenter);
      return height * toEdge;
    },
  };
}

/** True if (x, z) lies inside the settlement area including its blend band. */
export function isInSettlementArea(map: MapDefinition, x: number, z: number): boolean {
  const reach = map.settlement.halfSize + map.settlement.blend;
  return Math.abs(x) < reach && Math.abs(z) < reach;
}
