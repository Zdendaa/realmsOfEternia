import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { DoubleSide, MeshStandardMaterial } from 'three';
import type { GroundCover as GroundCoverData, GroundCoverItem } from '../../world/groundCover';
import { createFlowerGeometry, createTuftGeometry } from './groundCoverGeometry';
import { groupIntoChunks, packColors, packMatrices } from './instanceData';
import { StaticInstances } from './StaticInstances';

/** Smaller than tree chunks: ground cover is dense, so finer culling pays off. */
const CHUNK_SIZE = 40;
const TUFT_COLORS = ['#5f9539', '#4e8331', '#70a040', '#86a248'];
const FLOWER_COLORS = ['#f3f0e4', '#f2cd42', '#a77bd8'];

/** One wind clock for all ground cover (module-level, so no hook state is mutated). */
const windTime = { value: 0 };

/**
 * Standard material plus a cheap wind sway in the vertex shader: vertices move in
 * proportion to their height, phase-shifted by the instance's world position.
 */
function createSwayMaterial(cacheKey: string, sway: number) {
  const material = new MeshStandardMaterial({
    roughness: 0.9,
    flatShading: true,
    side: DoubleSide,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = windTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWindTime;')
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec2 roeBase = instanceMatrix[3].xz;
        #else
          vec2 roeBase = vec2(0.0);
        #endif
        float roeSway = sin(uWindTime * 1.6 + roeBase.x * 0.35 + roeBase.y * 0.27) * 0.6
          + sin(uWindTime * 2.9 + roeBase.x * 0.9 - roeBase.y * 0.4) * 0.25;
        transformed.xz += vec2(1.0, 0.6) * roeSway * transformed.y * ${sway.toFixed(3)};`,
      );
  };
  material.customProgramCacheKey = () => cacheKey;
  return material;
}

function useChunks(items: readonly GroundCoverItem[], colors: readonly string[]) {
  return useMemo(
    () =>
      groupIntoChunks(items, CHUNK_SIZE).map((chunk) => ({
        key: chunk.key,
        matrices: packMatrices(chunk.items, (t) => ({
          position: [t.x, t.y - 0.03, t.z],
          rotation: [0, t.rotation, 0],
          scale: t.scale,
        })),
        colors: packColors(chunk.items, (t, c) =>
          c.set(colors[t.variant] ?? '#ffffff').multiplyScalar(0.9 + (t.scale - 0.6) * 0.25),
        ),
      })),
    [items, colors],
  );
}

interface GroundCoverProps {
  cover: GroundCoverData;
}

/** Instanced grass tufts and flower clusters, chunked for culling; no shadow casting. */
export function GroundCover({ cover }: GroundCoverProps) {
  const assets = useMemo(
    () => ({
      tuftGeometry: createTuftGeometry(4),
      flowerGeometry: createFlowerGeometry(),
      tuftMaterial: createSwayMaterial('roe-grass-sway-v1', 0.09),
      flowerMaterial: createSwayMaterial('roe-flower-sway-v1', 0.06),
    }),
    [],
  );
  useEffect(() => () => Object.values(assets).forEach((asset) => asset.dispose()), [assets]);

  const tuftChunks = useChunks(cover.tufts, TUFT_COLORS);
  const flowerChunks = useChunks(cover.flowers, FLOWER_COLORS);

  useFrame((_, delta) => {
    windTime.value += delta;
  });

  return (
    <>
      {tuftChunks.map((chunk) => (
        <StaticInstances
          key={`t${chunk.key}`}
          geometry={assets.tuftGeometry}
          material={assets.tuftMaterial}
          matrices={chunk.matrices}
          colors={chunk.colors}
          castShadow={false}
        />
      ))}
      {flowerChunks.map((chunk) => (
        <StaticInstances
          key={`f${chunk.key}`}
          geometry={assets.flowerGeometry}
          material={assets.flowerMaterial}
          matrices={chunk.matrices}
          colors={chunk.colors}
          castShadow={false}
        />
      ))}
    </>
  );
}
