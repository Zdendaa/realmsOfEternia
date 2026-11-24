import { useFrame } from '@react-three/fiber';
import type { EntityId } from '@roe/shared';
import type { BuildingInstance, GameState, UnitInstance } from '@roe/sim';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  Euler,
  InstancedBufferAttribute,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type InstancedMesh,
} from 'three';
import { useGameStore } from '../../state/gameStore';
import { simClock } from '../simulation/simClock';
import { createSerfParts } from './placeholderSerf';
import { ownerColor } from './unitColors';
import { unitPose } from './unitPose';

/** Instance slots allocated once: 4 players × 200 serfs, plus headroom. */
const CAPACITY = 1024;
/** How quickly units turn toward their walking direction (per second). */
const TURN_RATE = 12;

const matrix = new Matrix4();
const position = new Vector3();
const quaternion = new Quaternion();
const euler = new Euler(0, 0, 0, 'YXZ');
/** Placeholder serfs are modelled 1 unit tall; drawn a bit larger to read at RTS zoom. */
const UNIT_SCALE = 1.35;
const scale = new Vector3(UNIT_SCALE, UNIT_SCALE, UNIT_SCALE);

/** Shortest signed angle from `a` to `b`. */
const angleDelta = (a: number, b: number) => {
  const d = (b - a) % (Math.PI * 2);
  return d > Math.PI ? d - Math.PI * 2 : d < -Math.PI ? d + Math.PI * 2 : d;
};

/**
 * Draws every unit with two instanced meshes (tinted cloth, fixed-color body), so
 * hundreds of serfs cost two draw calls. Positions are interpolated between the previous
 * and the current tick; facing and the procedural pose are computed per frame. Nothing
 * here goes through React state.
 */
export function Units() {
  const parts = useMemo(() => createSerfParts(), []);
  const materials = useMemo(
    () => ({
      cloth: new MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }),
      body: new MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }),
    }),
    [],
  );
  const clothRef = useRef<InstancedMesh>(null);
  const bodyRef = useRef<InstancedMesh>(null);
  const headings = useRef(new Map<EntityId, number>());
  // Lookup maps, rebuilt only when the underlying arrays change (once per tick at most).
  const lookups = useRef({
    previous: null as GameState | null,
    previousUnits: new Map<EntityId, UnitInstance>(),
    buildingsRef: null as readonly BuildingInstance[] | null,
    buildings: new Map<EntityId, BuildingInstance>(),
  });

  // Instance colors must exist before the first render compiles the shader; nothing is
  // drawn until the first frame has written real matrices.
  useLayoutEffect(() => {
    const cloth = clothRef.current;
    const body = bodyRef.current;
    if (!cloth || !body) return;
    cloth.instanceColor = new InstancedBufferAttribute(new Float32Array(CAPACITY * 3), 3);
    cloth.count = 0;
    body.count = 0;
  }, []);

  useEffect(
    () => () => {
      parts.cloth.dispose();
      parts.body.dispose();
      materials.cloth.dispose();
      materials.body.dispose();
    },
    [parts, materials],
  );

  useFrame((_, delta) => {
    const cloth = clothRef.current;
    const body = bodyRef.current;
    if (!cloth || !body) return;
    const { state, previous, ctx } = useGameStore.getState();
    const look = lookups.current;
    if (look.previous !== previous) {
      look.previous = previous;
      look.previousUnits = new Map(previous.units.map((u) => [u.id, u]));
    }
    if (look.buildingsRef !== state.buildings) {
      look.buildingsRef = state.buildings;
      look.buildings = new Map(state.buildings.map((b) => [b.id, b]));
    }

    const { alpha, time } = simClock;
    const turn = Math.min(1, delta * TURN_RATE);
    let count = 0;
    for (const unit of state.units) {
      if (count >= CAPACITY) break;
      const before = look.previousUnits.get(unit.id) ?? unit;
      const x = before.x + (unit.x - before.x) * alpha;
      const z = before.z + (unit.z - before.z) * alpha;

      // Face the walking direction, or the site while building.
      let heading = headings.current.get(unit.id) ?? 0;
      const dx = unit.x - before.x;
      const dz = unit.z - before.z;
      let target: number | null = null;
      if (unit.activity === 'walking' && dx * dx + dz * dz > 1e-6) {
        target = Math.atan2(dx, dz);
      } else if (unit.activity === 'working' && unit.task.kind === 'build') {
        const site = look.buildings.get(unit.task.siteId);
        if (site) target = Math.atan2(site.x - x, site.z - z);
      }
      if (target !== null) heading += angleDelta(heading, target) * turn;
      headings.current.set(unit.id, heading);

      const pose = unitPose(unit.activity, time, unit.id * 1.7);
      position.set(x, ctx.heights.getHeightAt(x, z) + pose.lift, z);
      quaternion.setFromEuler(euler.set(pose.pitch, heading, pose.roll));
      matrix.compose(position, quaternion, scale);
      cloth.setMatrixAt(count, matrix);
      body.setMatrixAt(count, matrix);
      cloth.setColorAt(count, ownerColor(unit.ownerId));
      count++;
    }

    cloth.count = count;
    body.count = count;
    cloth.instanceMatrix.needsUpdate = true;
    body.instanceMatrix.needsUpdate = true;
    if (cloth.instanceColor) cloth.instanceColor.needsUpdate = true;
    if (headings.current.size > state.units.length * 2 + 64) headings.current.clear();
  });

  return (
    <>
      <instancedMesh
        ref={clothRef}
        args={[parts.cloth, materials.cloth, CAPACITY]}
        castShadow
        frustumCulled={false}
      />
      <instancedMesh
        ref={bodyRef}
        args={[parts.body, materials.body, CAPACITY]}
        castShadow
        frustumCulled={false}
      />
    </>
  );
}
