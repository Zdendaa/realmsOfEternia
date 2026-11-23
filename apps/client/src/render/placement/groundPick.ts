import type { HeightField } from '@roe/shared';
import { Vector3, type Ray } from 'three';

const point = new Vector3();

/**
 * Where a ray first hits the terrain, by marching along it and refining the crossing
 * with bisection. Uses the shared height function, so it's cheap and exact, unlike a
 * raycast against the 100k-triangle terrain mesh.
 */
export function pickGround(
  ray: Ray,
  heights: HeightField,
  target: Vector3,
  maxDistance = 900,
): Vector3 | null {
  const above = (t: number) => {
    ray.at(t, point);
    return point.y - heights.getHeightAt(point.x, point.z);
  };
  let previous = 0;
  // Fine steps near the camera, coarser further away.
  for (let t = 0.5; t <= maxDistance; t += Math.max(0.5, t * 0.02)) {
    if (above(t) <= 0) {
      let lo = previous;
      let hi = t;
      for (let i = 0; i < 12; i++) {
        const mid = (lo + hi) / 2;
        if (above(mid) > 0) lo = mid;
        else hi = mid;
      }
      return ray.at(hi, target);
    }
    previous = t;
  }
  return null;
}
