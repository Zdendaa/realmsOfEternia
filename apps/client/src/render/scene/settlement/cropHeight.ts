import type { BuildingDefinition } from '@roe/game-data';
import { Mesh, type Object3D } from 'three';

/**
 * Height of a ripe crop as a share of the model's crop mesh: waist-high, so farmers
 * working the field stay visible (the model's full crop is almost as tall as a villager).
 * Used by the field crops, construction sites and the placement ghost alike.
 */
export const RIPE_CROP_HEIGHT = 0.6;

/** The lowest point of a mesh's geometry (model units), where crop growth starts. */
export function cropBase(mesh: Mesh): number {
  mesh.geometry.computeBoundingBox();
  return mesh.geometry.boundingBox?.min.y ?? 0;
}

/**
 * Lowers the crop mesh in a cloned building tile to the ripe height, scaling it about
 * its base so it keeps standing on the soil. No-op for buildings without a crop.
 */
export function lowerCrop(tile: Object3D, definition: BuildingDefinition): void {
  const name = definition.cropMesh;
  if (!name) return;
  tile.traverse((object) => {
    if (!(object instanceof Mesh) || object.name !== name) return;
    const base = cropBase(object);
    object.scale.y *= RIPE_CROP_HEIGHT;
    object.position.y += base * (1 - RIPE_CROP_HEIGHT);
  });
}
