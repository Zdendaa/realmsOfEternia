import type { HeightField, MapDefinition } from '@roe/shared';
import { useEffect, useMemo } from 'react';
import { buildTerrainGeometry } from './terrainGeometry';

interface TerrainProps {
  map: MapDefinition;
  heights: HeightField;
}

/** Heightmap terrain generated from the map seed: playable area, border and beyond. */
export function Terrain({ map, heights }: TerrainProps) {
  const geometry = useMemo(() => buildTerrainGeometry(map, heights), [map, heights]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial vertexColors roughness={1} />
    </mesh>
  );
}
