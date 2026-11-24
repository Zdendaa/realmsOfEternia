import { BufferAttribute, Color, type BufferGeometry } from 'three';

/**
 * Paints every vertex of `geometry` (vertex colors); faces whose normal runs along
 * local Y (caps of cylinders, tops of boxes) get `capColor`.
 */
export function paint(geometry: BufferGeometry, color: string, capColor = color) {
  const side = new Color(color);
  const cap = new Color(capColor);
  const normals = geometry.getAttribute('normal');
  const colors = new Float32Array(normals.count * 3);
  for (let i = 0; i < normals.count; i++) {
    (Math.abs(normals.getY(i)) > 0.9 ? cap : side).toArray(colors, i * 3);
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  return geometry;
}

/** Same attribute layout for merging: non-indexed, position + normal + color (no uv). */
export function prepare(geometry: BufferGeometry) {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  flat.deleteAttribute('uv');
  return flat;
}
