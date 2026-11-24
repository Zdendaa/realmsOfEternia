import type { Decoration } from '@roe/shared';
import { initialAmount } from '@roe/sim';
import type { GroundLevel } from './groundLevel';
import { useEffect, useMemo } from 'react';
import { DodecahedronGeometry, MeshStandardMaterial } from 'three';
import { packMatrices } from './instanceData';
import { StaticInstances } from './StaticInstances';

interface RocksProps {
  items: readonly Decoration[];
  /** Ground height lookup; rocks are re-seated when it changes. */
  groundLevel: GroundLevel;
  /** Quarried amounts by rock id: rocks shrink as they are mined and vanish at 0. */
  resourceNodes: Readonly<Record<number, number>>;
}

/** Size of a partly quarried rock: from full size down to this fraction before it vanishes. */
const MIN_ROCK_SIZE = 0.45;

/**
 * Placeholder boulders rendered as a single instanced mesh (about a hundred rocks, so
 * a quarried rock simply repacks all of them).
 */
export function Rocks({ items, groundLevel, resourceNodes }: RocksProps) {
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

  const matrices = useMemo(() => {
    const standing = items.filter((r) => resourceNodes[r.id] !== 0);
    return packMatrices(standing, (r) => {
      const left = resourceNodes[r.id];
      const size =
        left === undefined ? 1 : MIN_ROCK_SIZE + (1 - MIN_ROCK_SIZE) * (left / initialAmount(r));
      const s = r.scale * size;
      return {
        position: [r.x, groundLevel.at(r.x, r.z, r.y) + 0.3 * s - 0.1, r.z],
        rotation: [r.rotation * 0.3, r.rotation, 0],
        scale: [s * 1.3, s * 0.75, s],
      };
    });
  }, [items, groundLevel, resourceNodes]);

  return <StaticInstances geometry={geometry} material={material} matrices={matrices} />;
}
