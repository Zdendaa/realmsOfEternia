import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  BoxGeometry,
  BufferAttribute,
  Color,
  CylinderGeometry,
  DoubleSide,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
  type BufferGeometry,
  type InstancedMesh,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useGameStore } from '../../state/gameStore';
import { shownAt } from '../fog/knowledge';
import { ownerColor } from './unitColors';

/** Most graves drawn at once (three hero types per player). */
const CAPACITY = 24;
const matrix = new Matrix4();

/** One color per shape, so they can merge into one mesh. */
function paint(geometry: BufferGeometry, color: string): BufferGeometry {
  const plain = geometry.index ? geometry.toNonIndexed() : geometry;
  plain.deleteAttribute('uv');
  const count = plain.getAttribute('position').count;
  const { r, g, b } = new Color(color);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) colors.set([r, g, b], i * 3);
  plain.setAttribute('color', new BufferAttribute(colors, 3));
  return plain;
}

/** A mound of earth with a rounded headstone and the pole of a pennant (code-built). */
function graveGeometry(): BufferGeometry {
  const mound = paint(new CylinderGeometry(0.34, 0.52, 0.16, 10), '#6e5d3d');
  mound.translate(0, 0.08, 0.1);
  const stone = paint(new BoxGeometry(0.58, 0.72, 0.18), '#a7a399');
  stone.translate(0, 0.48, -0.22);
  const top = paint(
    new CylinderGeometry(0.29, 0.29, 0.18, 16, 1, false, -Math.PI / 2, Math.PI),
    '#a7a399',
  );
  top.rotateX(-Math.PI / 2).translate(0, 0.84, -0.22);
  const cross = [
    paint(new BoxGeometry(0.08, 0.36, 0.04), '#6f6c64').translate(0, 0.62, -0.12),
    paint(new BoxGeometry(0.24, 0.08, 0.04), '#6f6c64').translate(0, 0.68, -0.12),
  ];
  const pole = paint(new BoxGeometry(0.06, 1.5, 0.06), '#583c25');
  pole.translate(0.46, 0.75, -0.22);
  return mergeGeometries([mound, stone, top, ...cross, pole]);
}

/** The grave markers' GPU objects and their per-frame update (outside React). */
function createGraves() {
  const marker = graveGeometry();
  const pennant = new BoxGeometry(0.46, 0.28, 0.03).translate(0.72, 1.34, -0.22);
  const ring = new RingGeometry(0.72, 0.84, 32).rotateX(-Math.PI / 2);
  const stone = new MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
  const cloth = new MeshStandardMaterial({ roughness: 0.8 });
  const gold = new MeshBasicMaterial({
    color: '#f2b632',
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    side: DoubleSide,
  });
  return {
    marker,
    pennant,
    ring,
    stone,
    cloth,
    gold,
    update(meshes: readonly (InstancedMesh | null)[]) {
      const [stones, flags, rings] = meshes;
      if (!stones || !flags || !rings) return;
      const { state, heights } = useGameStore.getState();
      let count = 0;
      for (const grave of state.graves) {
        if (count >= CAPACITY) break;
        if (!shownAt(grave.ownerId, grave.x, grave.z)) continue;
        const y = heights.getHeightAt(grave.x, grave.z);
        matrix.makeTranslation(grave.x, y, grave.z);
        stones.setMatrixAt(count, matrix);
        flags.setMatrixAt(count, matrix);
        flags.setColorAt(count, ownerColor(grave.ownerId));
        rings.setMatrixAt(count, matrix.makeTranslation(grave.x, y + 0.07, grave.z));
        count++;
      }
      for (const mesh of [stones, flags, rings]) {
        mesh.count = count;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    },
    dispose() {
      for (const part of [marker, pennant, ring, stone, cloth, gold]) part.dispose();
    },
  };
}

/** The graves of fallen heroes in sight: a headstone, a pennant and a golden ring. */
export function Graves() {
  const graves = useMemo(() => createGraves(), []);
  const stones = useRef<InstancedMesh>(null);
  const flags = useRef<InstancedMesh>(null);
  const rings = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    // The color attribute must exist before the shader compiles.
    flags.current?.setColorAt(0, ownerColor(null));
    for (const mesh of [stones.current, flags.current, rings.current]) if (mesh) mesh.count = 0;
  }, []);
  useEffect(() => () => graves.dispose(), [graves]);
  useFrame(() => graves.update([stones.current, flags.current, rings.current]));

  return (
    <>
      <instancedMesh
        ref={stones}
        args={[graves.marker, graves.stone, CAPACITY]}
        castShadow
        frustumCulled={false}
      />
      <instancedMesh
        ref={flags}
        args={[graves.pennant, graves.cloth, CAPACITY]}
        castShadow
        frustumCulled={false}
      />
      <instancedMesh
        ref={rings}
        args={[graves.ring, graves.gold, CAPACITY]}
        frustumCulled={false}
        renderOrder={2}
      />
    </>
  );
}
