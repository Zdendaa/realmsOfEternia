import { Color, Euler, Matrix4, Quaternion, Vector3 } from 'three';

export interface InstanceTransform {
  position: [number, number, number];
  rotation?: [number, number, number];
  scale: number | [number, number, number];
}

const matrix = new Matrix4();
const position = new Vector3();
const quaternion = new Quaternion();
const euler = new Euler();
const scale = new Vector3();

/** Packs transforms into a flat Matrix4 array for `StaticInstances`. */
export function packMatrices<T>(items: readonly T[], toTransform: (item: T) => InstanceTransform) {
  const out = new Float32Array(items.length * 16);
  items.forEach((item, i) => {
    const t = toTransform(item);
    position.set(...t.position);
    quaternion.setFromEuler(euler.set(...(t.rotation ?? [0, 0, 0])));
    if (typeof t.scale === 'number') scale.setScalar(t.scale);
    else scale.set(...t.scale);
    matrix.compose(position, quaternion, scale).toArray(out, i * 16);
  });
  return out;
}

/** Packs colors into a flat RGB array for `StaticInstances`. */
export function packColors<T>(items: readonly T[], toColor: (item: T, target: Color) => Color) {
  const out = new Float32Array(items.length * 3);
  const color = new Color();
  items.forEach((item, i) => toColor(item, color).toArray(out, i * 3));
  return out;
}

/**
 * Groups items into square world-space chunks. Each chunk becomes its own instanced
 * mesh, so chunks outside the camera or shadow frustum are skipped entirely.
 */
export function groupIntoChunks<T extends { x: number; z: number }>(
  items: readonly T[],
  chunkSize: number,
): { key: string; items: T[] }[] {
  const chunks = new Map<string, T[]>();
  for (const item of items) {
    const key = `${Math.floor(item.x / chunkSize)},${Math.floor(item.z / chunkSize)}`;
    const chunk = chunks.get(key);
    if (chunk) chunk.push(item);
    else chunks.set(key, [item]);
  }
  return [...chunks].map(([key, chunkItems]) => ({ key, items: chunkItems }));
}
