import { BUILDINGS, type BuildingDefinition } from '@roe/game-data';
import type { HeightField } from '@roe/shared';
import { footprintOf, type BuildingInstance } from '@roe/sim';
import { Box3, Ray, Vector3 } from 'three';

const localRay = new Ray();
const box = new Box3();
const hit = new Vector3();

/** Rough clickable height of a building: flat fields are low, everything else box-like. */
function pickHeight(building: BuildingInstance): number {
  const { footprint, modelTiling, wallModel }: BuildingDefinition = BUILDINGS[building.type];
  if (wallModel) return wallModel.height;
  return modelTiling ? 0.6 : Math.max(footprint.w, footprint.d) * 0.8;
}

/**
 * The building whose footprint box the ray hits first, or null. Each building is an
 * oriented box (footprint × rough height), tested in its local frame.
 */
export function pickBuilding(
  ray: Ray,
  buildings: readonly BuildingInstance[],
  heights: HeightField,
): BuildingInstance | null {
  let best: BuildingInstance | null = null;
  let bestDistance = Infinity;
  for (const building of buildings) {
    const { w, d } = footprintOf(building.type, building.rotation);
    const y = heights.getHeightAt(building.x, building.z);
    const cos = Math.cos(-building.rotation);
    const sin = Math.sin(-building.rotation);
    const ox = ray.origin.x - building.x;
    const oz = ray.origin.z - building.z;
    // Rotate the ray by -rotation around Y (three.js rotation.y convention).
    localRay.origin.set(ox * cos + oz * sin, ray.origin.y - y, -ox * sin + oz * cos);
    localRay.direction.set(
      ray.direction.x * cos + ray.direction.z * sin,
      ray.direction.y,
      -ray.direction.x * sin + ray.direction.z * cos,
    );
    box.min.set(-w / 2, -0.5, -d / 2);
    box.max.set(w / 2, pickHeight(building), d / 2);
    if (!localRay.intersectBox(box, hit)) continue;
    const distance = hit.distanceTo(localRay.origin);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = building;
    }
  }
  return best;
}
