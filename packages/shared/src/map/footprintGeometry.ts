import type { Vec2 } from '../types.js';
import type { PlacedFootprint } from './flatten.js';
import type { HeightField } from './terrain.js';

export interface Bounds2D {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** World-space directions of a footprint's local X (width) and Z (depth) axes. */
export function footprintAxes(area: PlacedFootprint) {
  const cos = Math.cos(area.rotation);
  const sin = Math.sin(area.rotation);
  // three.js rotation.y: local (1,0,0) → (cos, 0, -sin), local (0,0,1) → (sin, 0, cos).
  return { ax: { x: cos, z: -sin }, az: { x: sin, z: cos } };
}

/** The four world-space corners, optionally grown by `margin` on every side. */
export function footprintCorners(area: PlacedFootprint, margin = 0): Vec2[] {
  const { ax, az } = footprintAxes(area);
  const hw = area.footprint.w / 2 + margin;
  const hd = area.footprint.d / 2 + margin;
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([sx = 0, sz = 0]) => ({
    x: area.x + ax.x * hw * sx + az.x * hd * sz,
    z: area.z + ax.z * hw * sx + az.z * hd * sz,
  }));
}

/** Axis-aligned bounds of a footprint grown by `margin`. */
export function footprintBounds(area: PlacedFootprint, margin = 0): Bounds2D {
  const corners = footprintCorners(area, margin);
  const xs = corners.map((c) => c.x);
  const zs = corners.map((c) => c.z);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  };
}

/**
 * True if two footprints overlap or come closer than `gap` (separating axis test on
 * rotated rectangles). A gap of 0 still rejects rectangles that merely touch.
 */
export function footprintsOverlap(a: PlacedFootprint, b: PlacedFootprint, gap = 0): boolean {
  const cornersA = footprintCorners(a, gap / 2);
  const cornersB = footprintCorners(b, gap / 2);
  const axes = [footprintAxes(a), footprintAxes(b)].flatMap(({ ax, az }) => [ax, az]);
  for (const axis of axes) {
    const project = (c: Vec2) => c.x * axis.x + c.z * axis.z;
    const pa = cornersA.map(project);
    const pb = cornersB.map(project);
    if (Math.max(...pa) <= Math.min(...pb) - 1e-9 || Math.max(...pb) <= Math.min(...pa) - 1e-9) {
      return false;
    }
  }
  return true;
}

/** Points covering a footprint on a grid of `spacing`, including its edges and corners. */
export function sampleFootprint(area: PlacedFootprint, spacing = 1): Vec2[] {
  const { ax, az } = footprintAxes(area);
  const cols = Math.max(1, Math.ceil(area.footprint.w / spacing));
  const rows = Math.max(1, Math.ceil(area.footprint.d / spacing));
  const points: Vec2[] = [];
  for (let i = 0; i <= cols; i++) {
    for (let j = 0; j <= rows; j++) {
      const lx = (i / cols - 0.5) * area.footprint.w;
      const lz = (j / rows - 0.5) * area.footprint.d;
      points.push({ x: area.x + ax.x * lx + az.x * lz, z: area.z + ax.z * lx + az.z * lz });
    }
  }
  return points;
}

/** Lowest and highest terrain height under a footprint. */
export function footprintHeightRange(heights: HeightField, area: PlacedFootprint, spacing = 1) {
  let min = Infinity;
  let max = -Infinity;
  for (const p of sampleFootprint(area, spacing)) {
    const h = heights.getHeightAt(p.x, p.z);
    min = Math.min(min, h);
    max = Math.max(max, h);
  }
  return { min, max };
}
