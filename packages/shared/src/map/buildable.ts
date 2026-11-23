import { createBaseHeightField, isInPlayableArea } from './terrain.js';
import type { MapDefinition } from './types.js';
import { createWaterMap, type WaterMap } from './water.js';

/** Keep construction this far (in lake-radius fractions) away from the shoreline. */
const SHORE_MARGIN = 0.15;

export interface BuildRules {
  water: WaterMap;
  /**
   * True where construction is allowed: inside the playable area and not in or right
   * next to water. Phase 3 adds slope, occupancy and ownership checks on top.
   */
  isBuildable(x: number, z: number): boolean;
}

export function createBuildRules(map: MapDefinition): BuildRules {
  const water = createWaterMap(map, createBaseHeightField(map));
  return {
    water,
    isBuildable: (x, z) => isInPlayableArea(map, x, z) && !water.isWater(x, z, SHORE_MARGIN),
  };
}
