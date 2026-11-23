import type { HeightField, MapDefinition } from '@roe/shared';
import { useEffect, useMemo } from 'react';
import { buildTerrainGeometry } from './terrainGeometry';

interface TerrainProps {
  map: MapDefinition;
  heights: HeightField;
}

/** Heightmap terrain generated from the map seed, plus a ground plane around it. */
export function Terrain({ map, heights }: TerrainProps) {
  const geometry = useMemo(() => buildTerrainGeometry(map, heights), [map, heights]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <group>
      <mesh geometry={geometry} receiveShadow>
        <meshStandardMaterial vertexColors roughness={1} />
      </mesh>
      {/* Surroundings outside the playable area. Map edges fade to height 0. */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.05}>
        <planeGeometry args={[map.size * 4, map.size * 4]} />
        <meshStandardMaterial color="#3f6229" roughness={1} />
      </mesh>
    </group>
  );
}
