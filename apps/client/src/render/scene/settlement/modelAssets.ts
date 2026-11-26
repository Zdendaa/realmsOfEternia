import { MEDIEVAL_PACK, type MaterialOverride } from '@roe/game-data';
import {
  Mesh,
  MeshStandardMaterial,
  type BufferGeometry,
  type Material,
  type Matrix4,
  type Object3D,
} from 'three';

/** Resolves a public-folder path against Vite's base URL. */
export function publicUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`;
}

/** Applies color/roughness overrides by material name. Idempotent; GLB files are never modified. */
export function applyMaterialOverrides(
  root: Object3D,
  overrides: Readonly<Record<string, MaterialOverride>> = MEDIEVAL_PACK.materialOverrides,
): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const materials: Material[] = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      const override = overrides[material.name];
      if (!override || !(material instanceof MeshStandardMaterial)) continue;
      if (override.color) material.color.set(override.color);
      if (override.roughness !== undefined) material.roughness = override.roughness;
    }
  });
}

/**
 * True if `object` or one of its ancestors is named in `names`. A glTF mesh with several
 * materials loads as a group (named after the node) of meshes with other names.
 */
export function isUnder(object: Object3D, names: readonly string[]): boolean {
  for (let o: Object3D | null = object; o; o = o.parent) if (names.includes(o.name)) return true;
  return false;
}

/**
 * The node called `name` of a loaded model, placed as in the model (its world matrix
 * includes its parents'); the whole model without a name. Throws if there is none.
 */
export function nodeOf(root: Object3D, name: string | undefined): Object3D {
  if (name === undefined) return root;
  root.updateMatrixWorld(true);
  const node = root.getObjectByName(name);
  if (!node) throw new Error(`Model has no node "${name}"`);
  return node;
}

export interface ModelPart {
  geometry: BufferGeometry;
  material: Material;
  /** Transform of the part relative to the model root. */
  matrix: Matrix4;
}

/**
 * Flattens a loaded model into (geometry, material, transform) parts, one per mesh,
 * ready to be drawn with one instanced mesh each. Nodes named in `skip` are left out with
 * everything under them (drawn separately, like a field's crop or mill sails).
 */
export function extractModelParts(root: Object3D, skip: readonly string[] = []): ModelPart[] {
  root.updateMatrixWorld(true);
  const parts: ModelPart[] = [];
  root.traverse((object) => {
    if (!(object instanceof Mesh) || isUnder(object, skip)) return;
    const materials: Material[] = Array.isArray(object.material)
      ? object.material
      : [object.material];
    const [material] = materials;
    if (!material) return;
    if (materials.length > 1) console.warn(`Multi-material mesh "${object.name}": using the first`);
    parts.push({ geometry: object.geometry, material, matrix: object.matrixWorld.clone() });
  });
  return parts;
}
