import { BUILDINGS, type BuildingDefinition } from '@roe/game-data';
import { footprintBounds, type HeightField, type Lake, type MapDefinition } from '@roe/shared';
import { toPlacedFootprint, type BuildingInstance } from '@roe/sim';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { WornPatch } from '../../world/decorateWorld';
import { yardPatches } from '../../world/yards';
import {
  buildTerrainGeometry,
  createTerrainColorizer,
  updateTerrainRegion,
} from './terrainGeometry';
import { createTerrainMaterial } from './terrainMaterial';
import { FLATTEN_REACH } from './groundLevel';

interface TerrainProps {
  map: MapDefinition;
  /** Current terrain (flattened under every building in the game state). */
  heights: HeightField;
  /** Buildings in the game state; new ones trigger a local terrain update. */
  buildings: readonly BuildingInstance[];
  /** Trampled dirt baked into the vertex colors (entrances, squares). */
  wornPatches: readonly WornPatch[];
  /** Lakes, for sandy banks and dark lake beds in the vertex colors. */
  lakes: readonly Lake[];
}

/**
 * Heightmap terrain: playable area, border and beyond. The mesh is built once; when
 * buildings are placed, only the vertices around them are re-sampled (with their dirt
 * yard).
 */
export function Terrain({ map, heights, buildings, wornPatches, lakes }: TerrainProps) {
  // The starting worn ground plus the dirt yards of buildings placed since; the colorizer
  // reads this list live, so a new building's yard is added before its region is redone.
  // (Built once like the geometry: the world, and so its worn ground, never changes.)
  const [patches] = useState(() => [...wornPatches]);
  const colorize = useMemo(
    () => createTerrainColorizer(map, patches, lakes),
    [map, patches, lakes],
  );
  // Built once from the heights at mount; later changes are applied region by region.
  const [geometry] = useState(() => buildTerrainGeometry(map, heights, colorize));
  const [appliedIds] = useState(() => new Set(buildings.map((b) => b.id)));
  const material = useMemo(() => createTerrainMaterial(), []);
  const lastHeights = useRef(heights);

  useEffect(() => {
    if (lastHeights.current === heights) return;
    lastHeights.current = heights;
    for (const building of buildings) {
      if (appliedIds.has(building.id)) continue;
      appliedIds.add(building.id);
      const placed = toPlacedFootprint(building);
      patches.push(
        ...yardPatches({ ...placed, definition: BUILDINGS[building.type] as BuildingDefinition }),
      );
      updateTerrainRegion(
        geometry,
        heights,
        footprintBounds(toPlacedFootprint(building), FLATTEN_REACH),
        colorize,
      );
    }
  }, [buildings, heights, geometry, appliedIds, colorize, patches]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  return <mesh geometry={geometry} material={material} receiveShadow />;
}
