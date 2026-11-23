import { BufferAttribute, BufferGeometry } from 'three';

/** Pushes one triangle (three xyz points). */
function triangle(out: number[], a: number[], b: number[], c: number[]) {
  out.push(...a, ...b, ...c);
}

/** Small deterministic generator, so the shared geometry is identical on every load. */
function sequence(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/**
 * A grass patch in world units: `blades` short, thin triangles spread over a disc,
 * each 0.25–0.45 units tall and leaning slightly. Many blades per instance make the
 * ground read as a meadow carpet rather than single spikes. Non-indexed, so flat
 * shading gives each blade one tone.
 */
export function createGrassPatchGeometry(blades = 10, radius = 0.55): BufferGeometry {
  const rand = sequence(0x9e3779b9);
  const positions: number[] = [];
  for (let i = 0; i < blades; i++) {
    const distance = Math.sqrt(rand()) * radius;
    const placement = rand() * Math.PI * 2;
    const x = Math.cos(placement) * distance;
    const z = Math.sin(placement) * distance;

    const facing = rand() * Math.PI;
    const px = Math.cos(facing);
    const pz = Math.sin(facing);
    const halfWidth = 0.022 + rand() * 0.014;
    const height = 0.25 + rand() * 0.2;
    const leanAngle = rand() * Math.PI * 2;
    const lean = 0.04 + rand() * 0.06;

    triangle(
      positions,
      [x - px * halfWidth, 0, z - pz * halfWidth],
      [x + px * halfWidth, 0, z + pz * halfWidth],
      [x + Math.cos(leanAngle) * lean, height, z + Math.sin(leanAngle) * lean],
    );
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * A flower cluster: tiny upward-pointing pyramids (blossoms) just above the grass.
 * Blossoms only; the surrounding grass reads as their stems.
 */
export function createFlowerGeometry(): BufferGeometry {
  const positions: number[] = [];
  const blossoms = [
    [0, 0.42, 0],
    [0.18, 0.36, 0.07],
    [-0.13, 0.4, 0.15],
    [-0.1, 0.33, -0.16],
    [0.12, 0.45, -0.13],
    [0.24, 0.31, -0.04],
  ];
  const r = 0.055;
  for (const [x = 0, y = 0, z = 0] of blossoms) {
    const top = [x, y + r * 0.9, z];
    const bottom = [x, y - r * 0.5, z];
    const ring = [0, 1, 2, 3].map((k) => {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      return [x + Math.cos(a) * r, y, z + Math.sin(a) * r];
    });
    for (let k = 0; k < 4; k++) {
      const a = ring[k] as number[];
      const b = ring[(k + 1) % 4] as number[];
      triangle(positions, a, top, b);
      triangle(positions, b, bottom, a);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.computeVertexNormals();
  return geometry;
}
