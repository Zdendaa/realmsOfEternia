import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { CHARACTER_PACK } from '@roe/game-data';
import type { Projectile } from '@roe/sim';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { Matrix4, Mesh, Quaternion, Vector3, type InstancedMesh } from 'three';
import { useGameStore } from '../../state/gameStore';
import { publicUrl } from '../scene/settlement/modelAssets';
import { simClock } from '../simulation/simClock';
import { renderedUnits } from '../units/renderedUnits';

const ARROW_URL = publicUrl(`${CHARACTER_PACK.dir}${CHARACTER_PACK.arrow}`);
useGLTF.preload(ARROW_URL, false);

/** Most arrows drawn at once. */
const CAPACITY = 512;
/** Arrows leave at bow height and hit at the chest (world units above the ground). */
const RELEASE_HEIGHT = 1.15;
const IMPACT_HEIGHT = 0.95;
/** Peak of the arc as a share of the flight distance. */
const ARC = 0.12;
/** Arrow model units → world units (the archers' scale). */
const ARROW_SCALE = CHARACTER_PACK.soldiers.archer.scale;

const matrix = new Matrix4();
const position = new Vector3();
const direction = new Vector3();
const quaternion = new Quaternion();
const scale = new Vector3(ARROW_SCALE, ARROW_SCALE, ARROW_SCALE);
/** The model's arrow points along +Z. */
const FORWARD = new Vector3(0, 0, 1);

/** Where each arrow is heading: its target as last seen (kept if the target vanishes). */
const lastTarget = new Map<string, Vector3>();
const keyOf = (p: Projectile) => `${p.attackerId}:${p.firedAt}`;

/**
 * Arrows in flight (`GameState.projectiles`), one instanced mesh. Each flies a shallow
 * arc from its release point to its target's current (interpolated) position, by the
 * share of its flight time that has passed, and points along its path. The simulation
 * decides hits; this only draws.
 */
export function Projectiles() {
  const { scene } = useGLTF(ARROW_URL, false);
  const model = useMemo(() => {
    let found: Mesh | null = null;
    scene.traverse((o) => {
      if (!found && o instanceof Mesh) found = o;
    });
    if (!found) throw new Error('Arrow model has no mesh');
    const mesh = found as Mesh;
    return { geometry: mesh.geometry, material: mesh.material };
  }, [scene]);
  const ref = useRef<InstancedMesh>(null);

  useLayoutEffect(() => {
    if (ref.current) ref.current.count = 0;
  }, []);

  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const { state, ctx } = useGameStore.getState();
    const now = state.tick - 1 + simClock.alpha;
    let count = 0;
    const live = new Set<string>();
    for (const p of state.projectiles) {
      if (count >= CAPACITY) break;
      const key = keyOf(p);
      live.add(key);
      const t = Math.min(1, Math.max(0, (now - p.firedAt) / (p.impactAt - p.firedAt)));
      const target = renderedUnits.get(p.targetId);
      let end = lastTarget.get(key);
      if (target) {
        end ??= new Vector3();
        end.set(target.x, target.y + IMPACT_HEIGHT, target.z);
        lastTarget.set(key, end);
      }
      if (!end) continue;
      const startY = ctx.heights.getHeightAt(p.fromX, p.fromZ) + RELEASE_HEIGHT;
      const dx = end.x - p.fromX;
      const dy = end.y - startY;
      const dz = end.z - p.fromZ;
      const arc = ARC * Math.sqrt(dx * dx + dz * dz);
      position.set(p.fromX + dx * t, startY + dy * t + arc * 4 * t * (1 - t), p.fromZ + dz * t);
      // Along the path: the derivative of the arc.
      direction.set(dx, dy + arc * 4 * (1 - 2 * t), dz).normalize();
      quaternion.setFromUnitVectors(FORWARD, direction);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(count++, matrix);
    }
    if (lastTarget.size > live.size) {
      for (const key of lastTarget.keys()) if (!live.has(key)) lastTarget.delete(key);
    }
    mesh.count = count;
    mesh.visible = count > 0;
    if (count > 0) mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={ref}
      args={[model.geometry, model.material, CAPACITY]}
      castShadow
      frustumCulled={false}
    />
  );
}
