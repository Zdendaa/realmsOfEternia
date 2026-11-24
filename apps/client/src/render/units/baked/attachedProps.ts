import {
  BufferAttribute,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  type BufferGeometry,
  type Material,
  type Matrix4,
  type MeshStandardMaterial,
} from 'three';
import { makeBakedSkinMaterial, type BakedSkinUniforms } from './bakedSkinMaterial';

/**
 * Something a unit carries or wears (a load, a hat, a tool): one instanced mesh whose
 * geometry is rigidly skinned to one bone, animated with the same per-instance clip
 * attributes as the unit, so it follows the body exactly. One draw call for all units.
 */
export interface AttachedProp {
  mesh: InstancedMesh;
  /** Instances written this frame. */
  count: number;
  write(matrix: Matrix4, anim: readonly [number, number, number, number]): void;
  /** Uploads this frame's instances (and hides the mesh when there are none). */
  finish(): void;
  dispose(): void;
}

/**
 * Skins every vertex of `geometry` (already placed in the character's bind space) to
 * `bone` with weight 1.
 */
export function skinRigidly(geometry: BufferGeometry, bone: number): BufferGeometry {
  const count = geometry.getAttribute('position').count;
  const skinIndex = new Float32Array(count * 4);
  const skinWeight = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    skinIndex[i * 4] = bone;
    skinWeight[i * 4] = 1;
  }
  geometry.setAttribute('skinIndex', new BufferAttribute(skinIndex, 4));
  geometry.setAttribute('skinWeight', new BufferAttribute(skinWeight, 4));
  geometry.computeBoundingSphere();
  return geometry;
}

export function createAttachedProp(
  geometry: BufferGeometry,
  material: MeshStandardMaterial,
  uniforms: BakedSkinUniforms,
  depthMaterial: Material,
  capacity: number,
): AttachedProp {
  const anim = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
  anim.setUsage(DynamicDrawUsage);
  geometry.setAttribute('aAnim', anim);
  const animArray = anim.array as Float32Array;
  const skinned = makeBakedSkinMaterial(material, uniforms);
  const mesh = new InstancedMesh(geometry, skinned, capacity);
  mesh.count = 0;
  mesh.visible = false;
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.customDepthMaterial = depthMaterial;

  const prop: AttachedProp = {
    mesh,
    count: 0,
    write(matrix, values) {
      if (prop.count >= capacity) return;
      mesh.setMatrixAt(prop.count, matrix);
      animArray.set(values, prop.count * 4);
      prop.count++;
    },
    finish() {
      mesh.count = prop.count;
      mesh.visible = prop.count > 0;
      if (prop.count > 0) {
        mesh.instanceMatrix.needsUpdate = true;
        anim.needsUpdate = true;
      }
      prop.count = 0;
    },
    dispose() {
      geometry.dispose();
      skinned.dispose();
    },
  };
  return prop;
}
