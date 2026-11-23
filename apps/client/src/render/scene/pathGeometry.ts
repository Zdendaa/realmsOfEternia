import { fractalNoise2D, type HeightField, type Vec2 } from '@roe/shared';
import { BufferAttribute, BufferGeometry, Color } from 'three';

/** Height above the terrain, so the ribbon doesn't z-fight with the ground. */
const LIFT = 0.07;
/** Width of the soft edge on each side, fading from opaque dirt to grass. */
const EDGE_SOFTNESS = 0.7;
/** How far (±) noise moves each edge in and out, so borders look worn, not ruled. */
const EDGE_WOBBLE = 0.3;
const DIRT_DARK = new Color('#5f5040');
const DIRT_LIGHT = new Color('#7d6b55');

/**
 * Lateral offsets and opacity of the five vertices across a path: transparent outer
 * edge, opaque inner edge, center, opaque inner edge, transparent outer edge.
 */
function crossSection(half: number, wobble: number) {
  const inner = half - EDGE_SOFTNESS / 2 + wobble;
  const outer = half + EDGE_SOFTNESS / 2 + wobble;
  return [
    { offset: outer, alpha: 0 },
    { offset: inner, alpha: 1 },
    { offset: 0, alpha: 1 },
    { offset: -inner, alpha: 1 },
    { offset: -outer, alpha: 0 },
  ];
}

/**
 * Builds one merged ribbon mesh for all paths, with vertex alpha for soft edges.
 * Every vertex sits on the terrain. Color depends only on world position, so where
 * ribbons overlap at junctions the blended result is the same dirt color.
 */
export function buildPathGeometry(
  paths: readonly Vec2[][],
  width: number,
  heights: HeightField,
  seed: number,
): BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const color = new Color();
  const columns = 5;

  for (const path of paths) {
    const base = positions.length / 3;
    path.forEach((point, i) => {
      const prev = path[Math.max(i - 1, 0)] as Vec2;
      const next = path[Math.min(i + 1, path.length - 1)] as Vec2;
      const length = Math.hypot(next.x - prev.x, next.z - prev.z) || 1;
      // Normal pointing to the left of the direction of travel.
      const nx = -(next.z - prev.z) / length;
      const nz = (next.x - prev.x) / length;
      const wobble = (fractalNoise2D(seed + 505, point.x / 3, point.z / 3, 2) - 0.5) * 2;

      for (const { offset, alpha } of crossSection(width / 2, wobble * EDGE_WOBBLE)) {
        const x = point.x + nx * offset;
        const z = point.z + nz * offset;
        positions.push(x, heights.getHeightAt(x, z) + LIFT, z);
        const variation = fractalNoise2D(seed + 303, x / 2.5, z / 2.5, 2);
        color.copy(DIRT_DARK).lerp(DIRT_LIGHT, variation);
        colors.push(color.r, color.g, color.b, alpha);
      }

      if (i === path.length - 1) return;
      const row = base + i * columns;
      const nextRow = row + columns;
      for (let k = 0; k < columns - 1; k++) {
        // Counter-clockwise seen from above, so the ribbon faces up.
        indices.push(row + k, nextRow + k, row + k + 1);
        indices.push(row + k + 1, nextRow + k, nextRow + k + 1);
      }
    });
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 4));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
