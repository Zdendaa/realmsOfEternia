import type { Vec2 } from './types.js';

/**
 * Samples a uniform Catmull-Rom spline through `points` at roughly `spacing` world
 * units. The curve passes through every point. Pure and deterministic, so client
 * rendering and server-side rules can share the same path shape.
 */
export function sampleCatmullRom(points: readonly Vec2[], spacing: number): Vec2[] {
  if (points.length < 2) return points.map((p) => ({ ...p }));
  const result: Vec2[] = [];
  const at = (i: number) => points[Math.min(Math.max(i, 0), points.length - 1)] as Vec2;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const steps = Math.max(1, Math.ceil(Math.hypot(p2.x - p1.x, p2.z - p1.z) / spacing));

    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const blend = (a: number, b: number, c: number, d: number) =>
        0.5 *
        (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      result.push({ x: blend(p0.x, p1.x, p2.x, p3.x), z: blend(p0.z, p1.z, p2.z, p3.z) });
    }
  }
  result.push({ ...at(points.length - 1) });
  return result;
}

/** Shortest distance from (x, z) to a polyline. */
export function distanceToPolyline(points: readonly Vec2[], x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i] as Vec2;
    const b = points[i + 1] as Vec2;
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const lengthSq = abx * abx + abz * abz;
    const t =
      lengthSq === 0 ? 0 : Math.min(1, Math.max(0, ((x - a.x) * abx + (z - a.z) * abz) / lengthSq));
    best = Math.min(best, Math.hypot(x - (a.x + abx * t), z - (a.z + abz * t)));
  }
  return best;
}
