import type { BuildingDefinition } from './types.js';

/**
 * Local (x, z) offsets of each model tile of a building, before rotation, in tile order
 * (column by column). A building without tiling has a single tile at its center. The
 * tiles of a field are its plots, so the simulation and the renderer share this order.
 */
export function tileOffsets(definition: BuildingDefinition): { x: number; z: number }[] {
  const tiling = definition.modelTiling;
  if (!tiling) return [{ x: 0, z: 0 }];
  const offsets: { x: number; z: number }[] = [];
  for (let c = 0; c < tiling.cols; c++) {
    for (let r = 0; r < tiling.rows; r++) {
      offsets.push({
        x: (c - (tiling.cols - 1) / 2) * tiling.stepX,
        z: (r - (tiling.rows - 1) / 2) * tiling.stepZ,
      });
    }
  }
  return offsets;
}
