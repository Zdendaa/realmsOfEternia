import { Color, MeshStandardMaterial, type Material } from 'three';

const cache = new WeakMap<Material, Map<string, Material>>();

/**
 * `base` with `tint` multiplied over its color (a wooden tower from the stone model), or
 * `base` itself without a tint. Cached, so instanced meshes share one material.
 */
export function tintedMaterial(base: Material, tint: string | undefined): Material {
  if (!tint || !(base instanceof MeshStandardMaterial)) return base;
  let byTint = cache.get(base);
  if (!byTint) cache.set(base, (byTint = new Map()));
  let material = byTint.get(tint);
  if (!material) {
    const tinted = base.clone();
    tinted.color.multiply(new Color(tint));
    byTint.set(tint, (material = tinted));
  }
  return material;
}
