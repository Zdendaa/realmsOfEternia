import { useLayoutEffect, useRef } from 'react';
import {
  InstancedBufferAttribute,
  type BufferGeometry,
  type InstancedMesh,
  type Material,
} from 'three';

interface StaticInstancesProps {
  geometry: BufferGeometry;
  material: Material;
  /** Instance transforms, 16 floats (one Matrix4) per instance. */
  matrices: Float32Array;
  /** Optional per-instance RGB colors, 3 floats per instance. */
  colors?: Float32Array | undefined;
}

/**
 * One draw call for many identical objects that never move (trees, rocks...).
 * Matrices are uploaded once, and the bounding sphere is computed from all
 * instances, so the whole group is frustum-culled correctly (also by the shadow camera).
 * Geometry and material are owned by the caller so chunks can share them.
 */
export function StaticInstances({ geometry, material, matrices, colors }: StaticInstancesProps) {
  const ref = useRef<InstancedMesh>(null);
  const count = matrices.length / 16;

  // Layout effect: data must be in place before the first frame compiles the shader,
  // otherwise instance colors would not be enabled in the material.
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    mesh.instanceMatrix.array.set(matrices);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor = colors ? new InstancedBufferAttribute(colors, 3) : null;
    mesh.computeBoundingSphere();
  }, [matrices, colors]);

  return <instancedMesh ref={ref} args={[geometry, material, count]} castShadow receiveShadow />;
}
