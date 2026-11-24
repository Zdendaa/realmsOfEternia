import { useFrame } from '@react-three/fiber';
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
import { simClock } from '../simulation/simClock';
import { createSerfParts } from './placeholderSerf';
import { renderedUnitList } from './renderedUnits';
import { ownerColor } from './unitColors';
import { unitPose } from './unitPose';
import { UNIT_CAPACITY } from './unitCapacity';

/** Placeholder serfs are modelled 1 unit tall; drawn a bit larger to read at RTS zoom. */
const UNIT_SCALE = 1.35;

const matrix = new Matrix4();
const position = new Vector3();
const quaternion = new Quaternion();
const euler = new Euler(0, 0, 0, 'YXZ');
const scale = new Vector3(UNIT_SCALE, UNIT_SCALE, UNIT_SCALE);

/**
 * Primitive serfs with procedural animation: two instanced meshes (tinted cloth, fixed
 * body). Shown while the character models load, and if they fail to load.
 */
export function PlaceholderUnits() {
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

  // Instance colors must exist before the first render compiles the shader; nothing is
  // drawn until the first frame has written real matrices.
  useLayoutEffect(() => {
    const cloth = clothRef.current;
    const body = bodyRef.current;
    if (!cloth || !body) return;
    cloth.instanceColor = new InstancedBufferAttribute(new Float32Array(UNIT_CAPACITY * 3), 3);
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

  useFrame(() => {
    const cloth = clothRef.current;
    const body = bodyRef.current;
    if (!cloth || !body) return;
    const count = Math.min(renderedUnitList.length, UNIT_CAPACITY);
    for (let i = 0; i < count; i++) {
      const unit = renderedUnitList[i];
      if (!unit) break;
      const pose = unitPose(unit.activity, simClock.time, unit.id * 1.7);
      position.set(unit.x, unit.y + pose.lift, unit.z);
      quaternion.setFromEuler(euler.set(pose.pitch, unit.heading, pose.roll));
      matrix.compose(position, quaternion, scale);
      cloth.setMatrixAt(i, matrix);
      body.setMatrixAt(i, matrix);
      cloth.setColorAt(i, ownerColor(unit.ownerId));
    }
    cloth.count = count;
    body.count = count;
    cloth.instanceMatrix.needsUpdate = true;
    body.instanceMatrix.needsUpdate = true;
    if (cloth.instanceColor) cloth.instanceColor.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh
        ref={clothRef}
        args={[parts.cloth, materials.cloth, UNIT_CAPACITY]}
        castShadow
        frustumCulled={false}
      />
      <instancedMesh
        ref={bodyRef}
        args={[parts.body, materials.body, UNIT_CAPACITY]}
        castShadow
        frustumCulled={false}
      />
    </>
  );
}
