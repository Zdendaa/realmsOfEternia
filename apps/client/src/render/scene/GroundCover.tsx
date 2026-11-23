import { useFrame } from '@react-three/fiber';
import { distanceToFootprint, footprintBounds, type PlacedFootprint } from '@roe/shared';
import { useEffect, useMemo, useRef } from 'react';
import { Color, DoubleSide, MeshStandardMaterial, Vector3, type Group } from 'three';
import type { GroundCover as GroundCoverData, GroundCoverItem } from '../../world/groundCover';
import { boundsOverlap, FLATTEN_REACH, GENERATED_GROUND, type GroundLevel } from './groundLevel';
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
const WHITE = new Color('#ffffff');

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

function packChunk(
  items: readonly GroundCoverItem[],
  palette: readonly Color[],
  groundLevel: GroundLevel,
) {
  return {
    matrices: packMatrices(items, (t) => ({
      position: [t.x, groundLevel.at(t.x, t.z, t.y) - 0.02, t.z],
      rotation: [0, t.rotation, 0],
      scale: t.scale,
    })),
    colors: packColors(items, (t, c) =>
      c.copy(palette[t.variant] ?? WHITE).multiplyScalar(0.92 + (t.scale - 0.85) * 0.25),
    ),
  };
}

/**
 * Chunks are packed once from the generated world. After a placement only the chunks
 * that a new building's flattening area touches are rebuilt (removing cover under the
 * building and re-seating the rest); all other chunks keep their exact objects, so
 * their GPU buffers aren't re-uploaded.
 */
function useChunks(
  items: readonly GroundCoverItem[],
  colors: readonly string[],
  groundLevel: GroundLevel,
  blockers: readonly PlacedFootprint[],
) {
  const base = useMemo(() => {
    const palette = colors.map((c) => new Color(c));
    return groupIntoChunks(items, CHUNK_SIZE).map((chunk) => {
      const xs = chunk.items.map((t) => t.x);
      const zs = chunk.items.map((t) => t.z);
      const ys = chunk.items.map((t) => t.y);
      const bounds = {
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minZ: Math.min(...zs),
        maxZ: Math.max(...zs),
      };
      const center = {
        x: (bounds.minX + bounds.maxX) / 2,
        y: (Math.min(...ys) + Math.max(...ys)) / 2,
        z: (bounds.minZ + bounds.maxZ) / 2,
      };
      return {
        key: chunk.key,
        items: chunk.items,
        palette,
        bounds,
        center,
        radius: Math.hypot(bounds.maxX - center.x, bounds.maxZ - center.z) + 1,
        ...packChunk(chunk.items, palette, GENERATED_GROUND),
      };
    });
  }, [items, colors]);

  return useMemo(() => {
    const changes = blockers.map((f) => ({
      footprint: f,
      area: footprintBounds(f, FLATTEN_REACH),
    }));
    return base.map((chunk) => {
      const touching = changes.filter((c) => boundsOverlap(c.area, chunk.bounds));
      if (touching.length === 0) return chunk;
      // Nothing grows under buildings placed after the world was generated.
      const kept = chunk.items.filter(
        (t) => !touching.some((c) => distanceToFootprint(c.footprint, t.x, t.z, 0.4) === 0),
      );
      return { ...chunk, ...packChunk(kept, chunk.palette, groundLevel) };
    });
  }, [base, blockers, groundLevel]);
}

interface GroundCoverProps {
  cover: GroundCoverData;
  /** Ground height lookup; ground cover is re-seated when it changes. */
  groundLevel: GroundLevel;
  /** Footprints of buildings placed after world generation; ground cover under them is removed. */
  blockers: readonly PlacedFootprint[];
}

/** Instanced grass patches and flower clusters, chunked and distance-culled; no shadows. */
export function GroundCover({ cover, groundLevel, blockers }: GroundCoverProps) {
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

  const grassChunks = useChunks(cover.tufts, TUFT_COLORS, groundLevel, blockers);
  const flowerChunks = useChunks(cover.flowers, FLOWER_COLORS, groundLevel, blockers);
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
