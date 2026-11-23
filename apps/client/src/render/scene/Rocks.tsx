import type { Decoration } from '@roe/shared';
import type { GroundLevel } from './groundLevel';
import { useEffect, useMemo } from 'react';
import { DodecahedronGeometry, MeshStandardMaterial } from 'three';
import { packMatrices } from './instanceData';
import { StaticInstances } from './StaticInstances';

interface RocksProps {
  items: readonly Decoration[];
  /** Ground height lookup; rocks are re-seated when it changes. */
  groundLevel: GroundLevel;
}

/** Placeholder boulders rendered as a single instanced mesh. */
export function Rocks({ items, groundLevel }: RocksProps) {
  const geometry = useMemo(() => new DodecahedronGeometry(0.8, 0), []);
  const material = useMemo(
    () => new MeshStandardMaterial({ color: '#8a8a84', roughness: 0.95, flatShading: true }),
    [],
  );
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  const matrices = useMemo(
    () =>
      packMatrices(items, (r) => ({
        position: [r.x, groundLevel.at(r.x, r.z, r.y) + 0.3 * r.scale - 0.1, r.z],
        rotation: [r.rotation * 0.3, r.rotation, 0],
        scale: [r.scale * 1.3, r.scale * 0.75, r.scale],
      })),
    [items, groundLevel],
  );

  return <StaticInstances geometry={geometry} material={material} matrices={matrices} />;
}
