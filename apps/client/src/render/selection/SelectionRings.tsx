import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { DoubleSide, Matrix4, MeshBasicMaterial, RingGeometry, type InstancedMesh } from 'three';
import { useSelectionStore } from '../../state/selectionStore';
import { renderedUnits } from '../units/renderedUnits';

/** Most rings drawn at once (a player has at most 200 serfs). */
const CAPACITY = 256;
const matrix = new Matrix4();

/**
 * Flat rings under the selected units, one instanced mesh. Positions come from the
 * frame's rendered unit positions, so mount this after `Units`.
 */
export function SelectionRings() {
  const geometry = useMemo(() => new RingGeometry(0.45, 0.58, 24).rotateX(-Math.PI / 2), []);
  const material = useMemo(
    () =>
      new MeshBasicMaterial({
        color: '#ffe08a',
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        side: DoubleSide,
      }),
    [],
  );
  const ref = useRef<InstancedMesh>(null);

  useLayoutEffect(() => {
    if (ref.current) ref.current.count = 0;
  }, []);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    let count = 0;
    for (const id of useSelectionStore.getState().units) {
      if (count >= CAPACITY) break;
      const unit = renderedUnits.get(id);
      if (!unit) continue;
      mesh.setMatrixAt(count++, matrix.makeTranslation(unit.x, unit.y + 0.05, unit.z));
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, CAPACITY]}
      frustumCulled={false}
      renderOrder={2}
    />
  );
}
