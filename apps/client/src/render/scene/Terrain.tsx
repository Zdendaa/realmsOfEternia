import type { HeightField, MapDefinition } from '@roe/shared';
import { useEffect, useMemo } from 'react';
import type { WornPatch } from '../../world/createWorld';
import { buildTerrainGeometry } from './terrainGeometry';

interface TerrainProps {
  map: MapDefinition;
  heights: HeightField;
  /** Trampled dirt baked into the vertex colors (entrances, squares). */
  wornPatches: readonly WornPatch[];
}

/** Heightmap terrain generated from the map seed: playable area, border and beyond. */
export function Terrain({ map, heights, wornPatches }: TerrainProps) {
  const geometry = useMemo(
    () => buildTerrainGeometry(map, heights, wornPatches),
    [map, heights, wornPatches],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial vertexColors roughness={1} />
    </mesh>
  );
}
