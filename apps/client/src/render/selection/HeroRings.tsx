import { useFrame } from '@react-three/fiber';
import { isHeroId, UNITS } from '@roe/game-data';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { DoubleSide, Matrix4, MeshBasicMaterial, RingGeometry, type InstancedMesh } from 'three';
import { renderedUnitList } from '../units/renderedUnits';

/** Most hero rings drawn at once (three hero types per player). */
const CAPACITY = 24;
/** How far the ring reaches beyond the hero's own radius. */
const MARGIN = 0.22;
const matrix = new Matrix4();

/**
 * A golden ring under every hero in sight, so heroes stand out in a crowd (the
 * selection ring lies inside it). A dead hero loses it.
 */
export function HeroRings() {
  const geometry = useMemo(() => new RingGeometry(0.9, 1, 32).rotateX(-Math.PI / 2), []);
  const material = useMemo(
    () =>
      new MeshBasicMaterial({
        color: '#f2b632',
        transparent: true,
        opacity: 0.95,
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
    for (const unit of renderedUnitList) {
      if (count >= CAPACITY) break;
      if (!isHeroId(unit.type) || unit.deathElapsed !== null) continue;
      const size = UNITS[unit.type].radius + MARGIN;
      matrix.makeScale(size, 1, size).setPosition(unit.x, unit.y + 0.06, unit.z);
      mesh.setMatrixAt(count++, matrix);
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
