import type { BufferGeometry } from 'three';
import {
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  SphereGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Temporary serf made of primitives (until the character models arrive in 4.5),
 * about 1 unit tall, facing +Z. Two parts: `cloth` is tinted per owner through instance
 * colors, `body` (head, legs) keeps fixed colors. Both use vertex colors.
 */
export interface SerfParts {
  cloth: BufferGeometry;
  body: BufferGeometry;
}

function colored(geometry: BufferGeometry, color: string, y: number): BufferGeometry {
  const g = geometry.toNonIndexed();
  g.translate(0, y, 0);
  const c = new Color(color);
  const count = g.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) c.toArray(colors, i * 3);
  g.setAttribute('color', new Float32BufferAttribute(colors, 3));
  g.deleteAttribute('uv');
  return g;
}

function merge(parts: BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries(parts);
  if (!merged) throw new Error('Could not merge serf geometry');
  merged.computeBoundingSphere();
  return merged;
}

export function createSerfParts(): SerfParts {
  // Cloth: a tapered tunic and a pointed hood; white and light grey so the tint shows.
  const tunic = colored(new CylinderGeometry(0.15, 0.24, 0.5, 8), '#ffffff', 0.45);
  const hood = colored(new ConeGeometry(0.15, 0.22, 8), '#d9d9d9', 0.98);
  // Body: legs, belt and head.
  const legs = colored(new CylinderGeometry(0.11, 0.09, 0.22, 6), '#4a3a2a', 0.11);
  const belt = colored(new CylinderGeometry(0.205, 0.215, 0.05, 8), '#5a4026', 0.38);
  const head = colored(new SphereGeometry(0.13, 10, 8), '#e2b48c', 0.82);
  return { cloth: merge([tunic, hood]), body: merge([legs, belt, head]) };
}
