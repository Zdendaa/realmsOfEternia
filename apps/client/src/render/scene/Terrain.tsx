import type { HeightField, Lake, MapDefinition } from '@roe/shared';
import { useEffect, useMemo } from 'react';
import type { WornPatch } from '../../world/decorateWorld';
import { buildTerrainGeometry } from './terrainGeometry';
import { createTerrainMaterial } from './terrainMaterial';

interface TerrainProps {
  map: MapDefinition;
  heights: HeightField;
  /** Trampled dirt baked into the vertex colors (entrances, squares). */
  wornPatches: readonly WornPatch[];
  /** Lakes, for sandy banks and dark lake beds in the vertex colors. */
  lakes: readonly Lake[];
}

/** Heightmap terrain generated from the map seed: playable area, border and beyond. */
export function Terrain({ map, heights, wornPatches, lakes }: TerrainProps) {
  const geometry = useMemo(
    () => buildTerrainGeometry(map, heights, wornPatches, lakes),
    [map, heights, wornPatches, lakes],
  );
  const material = useMemo(() => createTerrainMaterial(), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  return <mesh geometry={geometry} material={material} receiveShadow />;
}
