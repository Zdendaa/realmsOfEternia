import { MEDIEVAL_PACK } from '@roe/game-data';
import {
  Color,
  Mesh,
  type BufferGeometry,
  type Material,
  type Matrix4,
  type Object3D,
} from 'three';

/** Resolves a public-folder path against Vite's base URL. */
export function publicUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`;
}

/** Recolors materials by name. Idempotent; GLB files on disk are never modified. */
export function applyMaterialColorOverrides(
  root: Object3D,
  overrides: Readonly<Record<string, string>> = MEDIEVAL_PACK.materialColorOverrides,
): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const materials: Material[] = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      const color = overrides[material.name];
      if (color && 'color' in material && material.color instanceof Color) {
        material.color.set(color);
      }
    }
  });
}

export interface ModelPart {
  geometry: BufferGeometry;
  material: Material;
  /** Transform of the part relative to the model root. */
  matrix: Matrix4;
}

/**
 * Flattens a loaded model into (geometry, material, transform) parts, one per mesh,
 * ready to be drawn with one instanced mesh each.
 */
export function extractModelParts(root: Object3D): ModelPart[] {
  root.updateMatrixWorld(true);
  const parts: ModelPart[] = [];
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
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
