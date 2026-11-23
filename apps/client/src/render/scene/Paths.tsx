import type { HeightField, Vec2 } from '@roe/shared';
import { useEffect, useMemo } from 'react';
import { buildPathGeometry } from './pathGeometry';

interface PathsProps {
  paths: readonly Vec2[][];
  width: number;
  heights: HeightField;
  seed: number;
}

/** Dirt paths: flat ribbons following the terrain, drawn in one call. */
export function Paths({ paths, width, heights, seed }: PathsProps) {
  const geometry = useMemo(
    () => buildPathGeometry(paths, width, heights, seed),
    [paths, width, heights, seed],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial
        vertexColors
        roughness={1}
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-4}
      />
    </mesh>
  );
}
