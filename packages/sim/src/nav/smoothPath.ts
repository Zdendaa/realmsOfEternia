import type { Vec2 } from '@roe/shared';
import { isWalkable, NAV_RULES, type NavGrid } from './navGrid.js';

/** Sampling step of the line-of-sight test, as a fraction of a cell. */
const SIGHT_STEP = NAV_RULES.cellSize * 0.25;

/** True if the straight segment a→b only crosses walkable cells. */
export function hasLineOfSight(grid: NavGrid, a: Vec2, b: Vec2): boolean {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = Math.sqrt(dx * dx + dz * dz);
  const steps = Math.ceil(length / SIGHT_STEP);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (!isWalkable(grid, a.x + dx * t, a.z + dz * t)) return false;
  }
  return true;
}

/**
 * String pulling: drops every waypoint that the previous kept point can see past, so
 * units walk straight lines instead of grid zig-zags. The first point (the unit's own
 * position) may lie in a blocked cell; it is kept as is.
 */
export function smoothPath(grid: NavGrid, points: readonly Vec2[]): Vec2[] {
  if (points.length <= 2) return [...points];
  const first = points[0] as Vec2;
  const result: Vec2[] = [first];
  let anchor = first;
  // Leaving an obstacle: keep the first cell center so the unit steps out the short way.
  let i = isWalkable(grid, first.x, first.z) ? 1 : 2;
  if (i === 2) {
    anchor = points[1] as Vec2;
    result.push(anchor);
  }
  for (; i < points.length - 1; i++) {
    const next = points[i + 1] as Vec2;
    if (!hasLineOfSight(grid, anchor, next)) {
      anchor = points[i] as Vec2;
      result.push(anchor);
    }
  }
  result.push(points[points.length - 1] as Vec2);
  return result;
}
