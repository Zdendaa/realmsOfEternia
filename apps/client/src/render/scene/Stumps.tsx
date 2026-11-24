import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { HEXAGON_PACK } from '@roe/game-data';
import { distanceToFootprint, type Decoration, type PlacedFootprint } from '@roe/shared';
import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  DynamicDrawUsage,
  Euler,
  Matrix4,
  Mesh,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type InstancedMesh,
  type Material,
} from 'three';
import { simClock } from '../simulation/simClock';
import type { GroundLevel } from './groundLevel';
import { publicUrl } from './settlement/modelAssets';

/** Seconds a stump stays, then the seconds it takes to sink into the ground. */
const STUMP_LIFETIME = 180;
const SINK_SECONDS = 20;
/** Most stumps drawn at once per variant. */
const CAPACITY = 1024;

const URLS = HEXAGON_PACK.stumps.map(publicUrl);
useGLTF.preload(URLS, false);

/**
 * When each stump appeared (simulation clock seconds), by tree id. Felling isn't timed in
 * the game state, so the client times it from when it first sees the stump: cosmetic
 * only. Module-level, so it survives remounts.
 */
const firstSeen = new Map<number, number>();

const matrix = new Matrix4();
const position = new Vector3();
const quaternion = new Quaternion();
const euler = new Euler();
const scale = new Vector3();

interface StumpsProps {
  trees: readonly Decoration[];
  /** Harvested amounts by tree id; a tree at 0 is felled and leaves a stump. */
  resourceNodes: Readonly<Record<number, number>>;
  groundLevel: GroundLevel;
  /** Building footprints: stumps under a building are not drawn. */
  blockers: readonly PlacedFootprint[];
}

/** The single mesh of a stump model. */
function meshOf(scene: { traverse: (fn: (o: unknown) => void) => void }) {
  let found: { geometry: BufferGeometry; material: Material } | null = null;
  scene.traverse((o) => {
    if (!found && o instanceof Mesh) {
      found = { geometry: o.geometry, material: o.material as Material };
    }
  });
  if (!found) throw new Error('Stump model has no mesh');
  return found as { geometry: BufferGeometry; material: Material };
}

/**
 * Stumps of felled trees (two Hexagon pack variants, by tree id), sized to the trunk.
 * They don't block anything (the simulation already treats felled trees as gone), vanish
 * under new buildings, and sink into the ground a few minutes after felling. One
 * instanced mesh per variant; matrices are rewritten only when a stump appears or while
 * one is sinking.
 */
export function Stumps({ trees, resourceNodes, groundLevel, blockers }: StumpsProps) {
  const loaded = useGLTF(URLS, false);
  const variants = useMemo(() => loaded.map((g) => meshOf(g.scene)), [loaded]);
  const refs = useRef<(InstancedMesh | null)[]>([]);

  // Felled trees not covered by a building.
  const felled = useMemo(
    () =>
      trees.filter(
        (t) =>
          resourceNodes[t.id] === 0 &&
          !blockers.some((f) => distanceToFootprint(f, t.x, t.z, 0.3) === 0),
      ),
    [trees, resourceNodes, blockers],
  );

  // Rewrite when the list changes, and while any stump is sinking.
  const dirty = useRef(true);
  useLayoutEffect(() => {
    dirty.current = true;
    for (const mesh of refs.current) mesh?.instanceMatrix.setUsage(DynamicDrawUsage);
  }, [felled, groundLevel]);

  useFrame(() => {
    const now = simClock.time;
    let sinking = false;
    const counts = variants.map(() => 0);
    for (const tree of felled) {
      if (!firstSeen.has(tree.id)) {
        firstSeen.set(tree.id, now);
        dirty.current = true;
      }
      const age = now - (firstSeen.get(tree.id) ?? now);
      if (age >= STUMP_LIFETIME + SINK_SECONDS) continue;
      if (age > STUMP_LIFETIME) sinking = true;
    }
    if (!dirty.current && !sinking) return;
    dirty.current = false;

    for (const tree of felled) {
      const age = now - (firstSeen.get(tree.id) ?? now);
      if (age >= STUMP_LIFETIME + SINK_SECONDS) continue;
      const variant = tree.id % variants.length;
      const mesh = refs.current[variant];
      const index = counts[variant] ?? 0;
      if (!mesh || index >= CAPACITY) continue;
      const size = tree.scale * HEXAGON_PACK.stumpScale;
      const sink = age > STUMP_LIFETIME ? ((age - STUMP_LIFETIME) / SINK_SECONDS) * 0.3 * size : 0;
      position.set(tree.x, groundLevel.at(tree.x, tree.z, tree.y) - sink, tree.z);
      quaternion.setFromEuler(euler.set(0, tree.rotation, 0));
      matrix.compose(position, quaternion, scale.setScalar(size));
      mesh.setMatrixAt(index, matrix);
      counts[variant] = index + 1;
    }
    refs.current.forEach((mesh, i) => {
      if (!mesh) return;
      mesh.count = counts[i] ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
    });
  });

  return (
    <>
      {variants.map((v, i) => (
        <instancedMesh
          key={i}
          ref={(mesh) => {
            refs.current[i] = mesh;
          }}
          args={[v.geometry, v.material, CAPACITY]}
          castShadow
          receiveShadow
          frustumCulled={false}
        />
      ))}
    </>
  );
}
