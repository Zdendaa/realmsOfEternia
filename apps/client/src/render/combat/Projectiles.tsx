import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { CHARACTER_PACK, towerOf } from '@roe/game-data';
import type { Projectile } from '@roe/sim';
import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  Color,
  IcosahedronGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
  type InstancedMesh,
} from 'three';
import { useGameStore } from '../../state/gameStore';
import { publicUrl } from '../scene/settlement/modelAssets';
import { simClock } from '../simulation/simClock';
import { shownAt } from '../fog/knowledge';
import { renderedUnits } from '../units/renderedUnits';

const ARROW_URL = publicUrl(`${CHARACTER_PACK.dir}${CHARACTER_PACK.arrow}`);
useGLTF.preload(ARROW_URL, false);

/** Most arrows drawn at once. */
const CAPACITY = 512;
/** Arrows leave at bow height and hit at the chest (world units above the ground). */
const RELEASE_HEIGHT = 1.15;
const IMPACT_HEIGHT = 0.95;
const BUILDING_IMPACT_HEIGHT = 2;
/** Peak of the arc as a share of the flight distance. */
const ARC = 0.12;
/** Arrow model units → world units (the archers' scale). */
const ARROW_SCALE = CHARACTER_PACK.soldiers.archer.scale;

/** Most magic and fire orbs drawn at once. */
const ORB_CAPACITY = 128;

const matrix = new Matrix4();
const color = new Color();
const arrowScale = new Vector3();
const orbScale = new Vector3();
const position = new Vector3();
const direction = new Vector3();
const quaternion = new Quaternion();
/** The model's arrow points along +Z. */
const FORWARD = new Vector3(0, 0, 1);

/** Where each arrow is heading: its target as last seen (kept if the target vanishes). */
const lastTarget = new Map<string, Vector3>();
const keyOf = (p: Projectile) => `${p.attackerId}:${p.firedAt}`;

/**
 * Shots in flight (`GameState.projectiles`): arrows (and crossbow bolts, drawn larger)
 * in one instanced mesh, the magic and fire towers' orbs in another. Each flies a shallow
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

  const orbRef = useRef<InstancedMesh>(null);
  const orb = useMemo(
    () => ({
      geometry: new IcosahedronGeometry(1, 1),
      material: new MeshBasicMaterial({ toneMapped: false }),
    }),
    [],
  );

  useLayoutEffect(() => {
    if (ref.current) ref.current.count = 0;
    // The color attribute must exist before the shader is compiled.
    orbRef.current?.setColorAt(0, color);
    if (orbRef.current) orbRef.current.count = 0;
  }, []);

  useFrame(() => {
    const mesh = ref.current;
    const orbs = orbRef.current;
    if (!mesh || !orbs) return;
    const { state, ctx } = useGameStore.getState();
    const now = state.tick - 1 + simClock.alpha;
    let count = 0;
    let orbCount = 0;
    const live = new Set<string>();
    for (const p of state.projectiles) {
      if (count >= CAPACITY) break;
      // Arrows show when their shooter or their target is in sight.
      if (!shownAt(p.ownerId, p.fromX, p.fromZ) && !renderedUnits.has(p.targetId)) continue;
      const key = keyOf(p);
      live.add(key);
      const t = Math.min(1, Math.max(0, (now - p.firedAt) / (p.impactAt - p.firedAt)));
      const target = renderedUnits.get(p.targetId);
      let end = lastTarget.get(key);
      if (target) {
        end ??= new Vector3();
        end.set(target.x, target.y + IMPACT_HEIGHT, target.z);
        lastTarget.set(key, end);
      } else if (!end) {
        // A building: the arrow lands in its wall, at mid height.
        const building = state.buildings.find((b) => b.id === p.targetId);
        if (building) {
          end = new Vector3(
            building.x,
            ctx.heights.getHeightAt(building.x, building.z) + BUILDING_IMPACT_HEIGHT,
            building.z,
          );
          lastTarget.set(key, end);
        }
      }
      if (!end) continue;
      const startY = ctx.heights.getHeightAt(p.fromX, p.fromZ) + (p.fromHeight ?? RELEASE_HEIGHT);
      const dx = end.x - p.fromX;
      const dy = end.y - startY;
      const dz = end.z - p.fromZ;
      const arc = ARC * Math.sqrt(dx * dx + dz * dz);
      position.set(p.fromX + dx * t, startY + dy * t + arc * 4 * t * (1 - t), p.fromZ + dz * t);
      // Along the path: the derivative of the arc.
      direction.set(dx, dy + arc * 4 * (1 - 2 * t), dz).normalize();
      quaternion.setFromUnitVectors(FORWARD, direction);
      const shot = p.source === undefined ? undefined : towerOf(p.source)?.shot;
      if (shot?.look === 'orb') {
        if (orbCount >= ORB_CAPACITY) continue;
        matrix.compose(position, quaternion, orbScale.setScalar(shot.size));
        orbs.setMatrixAt(orbCount, matrix);
        orbs.setColorAt(orbCount++, color.set(shot.color));
      } else {
        arrowScale.setScalar(ARROW_SCALE * (shot?.size ?? 1));
        matrix.compose(position, quaternion, arrowScale);
        mesh.setMatrixAt(count++, matrix);
      }
    }
    orbs.count = orbCount;
    orbs.visible = orbCount > 0;
    if (orbCount > 0) {
      orbs.instanceMatrix.needsUpdate = true;
      if (orbs.instanceColor) orbs.instanceColor.needsUpdate = true;
    }
    if (lastTarget.size > live.size) {
      for (const key of lastTarget.keys()) if (!live.has(key)) lastTarget.delete(key);
    }
    mesh.count = count;
    mesh.visible = count > 0;
    if (count > 0) mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh
        ref={ref}
        args={[model.geometry, model.material, CAPACITY]}
        castShadow
        frustumCulled={false}
      />
      <instancedMesh
        ref={orbRef}
        args={[orb.geometry, orb.material, ORB_CAPACITY]}
        frustumCulled={false}
      />
    </>
  );
}
