import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { DoubleSide, MeshStandardMaterial, Vector3, type Group } from 'three';
import type { GroundCover as GroundCoverData, GroundCoverItem } from '../../world/groundCover';
import { createFlowerGeometry, createGrassPatchGeometry } from './groundCoverGeometry';
import { groupIntoChunks, packColors, packMatrices } from './instanceData';
import { StaticInstances } from './StaticInstances';

/** Smaller than tree chunks: ground cover is dense, so finer culling pays off. */
const CHUNK_SIZE = 40;
/**
 * Ground cover shrinks into the ground between these camera distances (in the vertex
 * shader, so nothing pops), and whole chunks beyond FADE_END are not drawn at all.
 * At the default zoom the whole screen stays within FADE_START.
 */
const FADE_START = 100;
const FADE_END = 140;
const TUFT_COLORS = ['#5f9539', '#4e8331', '#70a040', '#86a248'];
const FLOWER_COLORS = ['#f3f0e4', '#f2cd42', '#a77bd8'];

/** One wind clock for all ground cover (module-level, so no hook state is mutated). */
const windTime = { value: 0 };
const chunkCenter = new Vector3();

/**
 * Standard material plus two cheap vertex-shader effects: wind sway proportional to
 * height, and a shrink toward the ground with camera distance.
 */
function createGroundCoverMaterial(cacheKey: string, sway: number) {
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
          vec3 roeBase = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        #else
          vec3 roeBase = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        #endif
        float roeSway = sin(uWindTime * 1.6 + roeBase.x * 0.35 + roeBase.z * 0.27) * 0.6
          + sin(uWindTime * 2.9 + roeBase.x * 0.9 - roeBase.z * 0.4) * 0.25;
        transformed.xz += vec2(1.0, 0.6) * roeSway * transformed.y * ${sway.toFixed(3)};
        transformed *= 1.0 - smoothstep(${FADE_START.toFixed(1)}, ${FADE_END.toFixed(1)}, distance(roeBase, cameraPosition));`,
      );
  };
  material.customProgramCacheKey = () => cacheKey;
  return material;
}

function useChunks(items: readonly GroundCoverItem[], colors: readonly string[]) {
  return useMemo(
    () =>
      groupIntoChunks(items, CHUNK_SIZE).map((chunk) => {
        const xs = chunk.items.map((t) => t.x);
        const zs = chunk.items.map((t) => t.z);
        const ys = chunk.items.map((t) => t.y);
        const center = {
          x: (Math.min(...xs) + Math.max(...xs)) / 2,
          y: (Math.min(...ys) + Math.max(...ys)) / 2,
          z: (Math.min(...zs) + Math.max(...zs)) / 2,
        };
        return {
          key: chunk.key,
          center,
          radius: Math.hypot(Math.max(...xs) - center.x, Math.max(...zs) - center.z) + 1,
          matrices: packMatrices(chunk.items, (t) => ({
            position: [t.x, t.y - 0.02, t.z],
            rotation: [0, t.rotation, 0],
            scale: t.scale,
          })),
          colors: packColors(chunk.items, (t, c) =>
            c.set(colors[t.variant] ?? '#ffffff').multiplyScalar(0.92 + (t.scale - 0.85) * 0.25),
          ),
        };
      }),
    [items, colors],
  );
}

interface GroundCoverProps {
  cover: GroundCoverData;
}

/** Instanced grass patches and flower clusters, chunked and distance-culled; no shadows. */
export function GroundCover({ cover }: GroundCoverProps) {
  const assets = useMemo(
    () => ({
      grassGeometry: createGrassPatchGeometry(10, 0.55),
      flowerGeometry: createFlowerGeometry(),
      grassMaterial: createGroundCoverMaterial('roe-grass-v2', 0.12),
      flowerMaterial: createGroundCoverMaterial('roe-flower-v2', 0.08),
    }),
    [],
  );
  useEffect(() => () => Object.values(assets).forEach((asset) => asset.dispose()), [assets]);

  const grassChunks = useChunks(cover.tufts, TUFT_COLORS);
  const flowerChunks = useChunks(cover.flowers, FLOWER_COLORS);
  const chunks = useMemo(
    () => [
      ...grassChunks.map((c) => ({ ...c, geometry: 'grass' as const })),
      ...flowerChunks.map((c) => ({ ...c, geometry: 'flower' as const })),
    ],
    [grassChunks, flowerChunks],
  );
  const groupRefs = useRef<(Group | null)[]>([]);

  useFrame(({ camera }, delta) => {
    windTime.value += delta;
    // Skip whole chunks that are entirely beyond the fade-out distance.
    chunks.forEach((chunk, i) => {
      const group = groupRefs.current[i];
      if (!group) return;
      chunkCenter.set(chunk.center.x, chunk.center.y, chunk.center.z);
      group.visible = camera.position.distanceTo(chunkCenter) - chunk.radius < FADE_END;
    });
  });

  return (
    <>
      {chunks.map((chunk, i) => (
        <group
          key={`${chunk.geometry}${chunk.key}`}
          ref={(group) => {
            groupRefs.current[i] = group;
          }}
        >
          <StaticInstances
            geometry={chunk.geometry === 'grass' ? assets.grassGeometry : assets.flowerGeometry}
            material={chunk.geometry === 'grass' ? assets.grassMaterial : assets.flowerMaterial}
            matrices={chunk.matrices}
            colors={chunk.colors}
            castShadow={false}
          />
        </group>
      ))}
    </>
  );
}
