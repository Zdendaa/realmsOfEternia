import { BufferAttribute, BufferGeometry } from 'three';

/** Pushes one triangle (three xyz points). */
function triangle(out: number[], a: number[], b: number[], c: number[]) {
  out.push(...a, ...b, ...c);
}

/**
 * A grass tuft: `blades` thin triangles fanned around the center, leaning outward.
 * About 1 unit tall at scale 1. Non-indexed, so flat shading gives each blade one tone.
 */
export function createTuftGeometry(blades = 4): BufferGeometry {
  const positions: number[] = [];
  for (let i = 0; i < blades; i++) {
    const angle = (i / blades) * Math.PI + i * 0.35;
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    // Perpendicular for the blade's width.
    const px = -dz;
    const pz = dx;
    const baseOffset = 0.06;
    const width = 0.09 + (i % 2) * 0.03;
    const lean = 0.22 + (i % 3) * 0.06;
    const height = 0.75 + ((i * 37) % 5) * 0.06;
    const bx = dx * baseOffset;
    const bz = dz * baseOffset;
    triangle(
      positions,
      [bx - px * width, 0, bz - pz * width],
      [bx + px * width, 0, bz + pz * width],
      [dx * lean, height, dz * lean],
    );
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * A flower cluster: small upward-pointing pyramids (blossoms) at varied heights.
 * Blossoms only; the surrounding grass reads as their stems.
 */
export function createFlowerGeometry(): BufferGeometry {
  const positions: number[] = [];
  const blossoms = [
    [0, 0.42, 0],
    [0.22, 0.34, 0.08],
    [-0.16, 0.38, 0.18],
    [-0.12, 0.3, -0.2],
    [0.14, 0.46, -0.16],
    [0.3, 0.28, -0.05],
  ];
  const r = 0.15;
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
