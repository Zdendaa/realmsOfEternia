import type { Decoration } from '@roe/shared';
import { boundsOverlap, GENERATED_GROUND, type GroundLevel } from './groundLevel';
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
  /** Ground height lookup; trees are re-seated when it changes (flattening near new buildings). */
  groundLevel: GroundLevel;
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

function packTrees(items: readonly Decoration[], ground: GroundLevel) {
  const groundY = (t: Decoration) => ground.at(t.x, t.z, t.y) - GROUND_SINK;
  return {
    trunks: packMatrices(items, (t) => ({
      position: [t.x, groundY(t) + (TRUNK_HEIGHT / 2) * t.scale, t.z],
      scale: t.scale,
    })),
    crowns: packMatrices(items, (t) => ({
      position: [t.x, groundY(t) + (TRUNK_HEIGHT + CROWN_HEIGHT / 2 - 0.2) * t.scale, t.z],
      rotation: [0, t.rotation, 0],
      scale: t.scale,
    })),
  };
}

/**
 * Placeholder conifers. Trees are split into world-space chunks; each chunk is two
 * instanced meshes (trunks + crowns) sharing one geometry and material per part.
 * After a placement only chunks touching the changed terrain are re-seated.
 */
export function Trees({ items, groundLevel }: TreesProps) {
  const assets = useTreeAssets();

  const base = useMemo(
    () =>
      groupIntoChunks(items, CHUNK_SIZE).map((chunk) => {
        const xs = chunk.items.map((t) => t.x);
        const zs = chunk.items.map((t) => t.z);
        return {
          key: chunk.key,
          items: chunk.items,
          bounds: {
            minX: Math.min(...xs),
            maxX: Math.max(...xs),
            minZ: Math.min(...zs),
            maxZ: Math.max(...zs),
          },
          ...packTrees(chunk.items, GENERATED_GROUND),
          crownColors: packColors(chunk.items, (t, c) =>
            c.copy(CROWN_DARK).lerp(CROWN_LIGHT, t.rotation / (Math.PI * 2)),
          ),
        };
      }),
    [items],
  );

  const chunks = useMemo(
    () =>
      base.map((chunk) =>
        groundLevel.changed.some((area) => boundsOverlap(area, chunk.bounds))
          ? { ...chunk, ...packTrees(chunk.items, groundLevel) }
          : chunk,
      ),
    [base, groundLevel],
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
