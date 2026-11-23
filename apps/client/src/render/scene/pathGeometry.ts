import { fractalNoise2D, type HeightField, type Vec2 } from '@roe/shared';
import { BufferAttribute, BufferGeometry, Color } from 'three';

/** Height above the terrain, so the ribbon doesn't z-fight with the ground. */
const LIFT = 0.07;
const DIRT_DARK = new Color('#8f7348');
const DIRT_LIGHT = new Color('#b4966a');

/**
 * Builds one merged ribbon mesh for all paths: three vertices across the width
 * (left, center, right), each sitting on the terrain. Color depends only on world
 * position, so overlapping ribbons at junctions look identical and don't flicker.
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
  const half = width / 2;

  for (const path of paths) {
    const base = positions.length / 3;
    path.forEach((point, i) => {
      const prev = path[Math.max(i - 1, 0)] as Vec2;
      const next = path[Math.min(i + 1, path.length - 1)] as Vec2;
      const length = Math.hypot(next.x - prev.x, next.z - prev.z) || 1;
      // Normal pointing to the left of the direction of travel.
      const nx = -(next.z - prev.z) / length;
      const nz = (next.x - prev.x) / length;

      for (const offset of [half, 0, -half]) {
        const x = point.x + nx * offset;
        const z = point.z + nz * offset;
        positions.push(x, heights.getHeightAt(x, z) + LIFT, z);
        const variation = fractalNoise2D(seed + 303, x / 2.5, z / 2.5, 2);
        color.copy(DIRT_DARK).lerp(DIRT_LIGHT, variation).toArray(colors, colors.length);
      }

      if (i === path.length - 1) return;
      const row = base + i * 3;
      const nextRow = row + 3;
      for (let k = 0; k < 2; k++) {
        // Counter-clockwise seen from above, so the ribbon faces up.
        indices.push(row + k, nextRow + k, row + k + 1);
        indices.push(row + k + 1, nextRow + k, nextRow + k + 1);
      }
    });
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
