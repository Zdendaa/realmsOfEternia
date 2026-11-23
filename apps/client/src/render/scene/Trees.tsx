import type { Decoration } from '@roe/shared';
import { useEffect, useMemo } from 'react';
import { Color, ConeGeometry, CylinderGeometry, MeshStandardMaterial } from 'three';
import { groupIntoChunks, packColors, packMatrices } from './instanceData';
import { StaticInstances } from './StaticInstances';

const TRUNK_HEIGHT = 1.2;
const CROWN_HEIGHT = 3.2;
/** Sink trees slightly into the ground so they sit well on slopes. */
const GROUND_SINK = 0.25;
const CROWN_DARK = new Color('#1f4d27');
const CROWN_LIGHT = new Color('#3c7633');
/** World-space size of one culling chunk. */
const CHUNK_SIZE = 60;

interface TreesProps {
  items: readonly Decoration[];
}

function useTreeAssets() {
  const assets = useMemo(
    () => ({
      trunkGeometry: new CylinderGeometry(0.18, 0.26, TRUNK_HEIGHT, 6),
      trunkMaterial: new MeshStandardMaterial({ color: '#5e4029', roughness: 1 }),
      crownGeometry: new ConeGeometry(1.2, CROWN_HEIGHT, 7),
      crownMaterial: new MeshStandardMaterial({ roughness: 0.9, flatShading: true }),
    }),
    [],
  );
  useEffect(() => () => Object.values(assets).forEach((asset) => asset.dispose()), [assets]);
  return assets;
}

/**
 * Placeholder conifers. Trees are split into world-space chunks; each chunk is two
 * instanced meshes (trunks + crowns) sharing one geometry and material per part.
 */
export function Trees({ items }: TreesProps) {
  const assets = useTreeAssets();

  const chunks = useMemo(
    () =>
      groupIntoChunks(items, CHUNK_SIZE).map((chunk) => ({
        key: chunk.key,
        trunks: packMatrices(chunk.items, (t) => ({
          position: [t.x, t.y - GROUND_SINK + (TRUNK_HEIGHT / 2) * t.scale, t.z],
          scale: t.scale,
        })),
        crowns: packMatrices(chunk.items, (t) => ({
          position: [
            t.x,
            t.y - GROUND_SINK + (TRUNK_HEIGHT + CROWN_HEIGHT / 2 - 0.2) * t.scale,
            t.z,
          ],
          rotation: [0, t.rotation, 0],
          scale: t.scale,
        })),
        crownColors: packColors(chunk.items, (t, c) =>
          c.copy(CROWN_DARK).lerp(CROWN_LIGHT, t.rotation / (Math.PI * 2)),
        ),
      })),
    [items],
  );

  return (
    <>
      {chunks.map((chunk) => (
        <group key={chunk.key}>
          <StaticInstances
            geometry={assets.trunkGeometry}
            material={assets.trunkMaterial}
            matrices={chunk.trunks}
          />
          <StaticInstances
            geometry={assets.crownGeometry}
            material={assets.crownMaterial}
            matrices={chunk.crowns}
            colors={chunk.crownColors}
          />
        </group>
      ))}
    </>
  );
}
