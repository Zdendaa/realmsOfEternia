/**
 * Deterministic, stateless 2D value noise.
 *
 * Every function here is a pure function of (seed, x, z): no lookup tables and no
 * hidden state. Any point can be sampled in any order and the same value comes
 * back on every machine.
 */

/** Hashes an integer lattice point to a float in [0, 1). */
function hash2(seed: number, ix: number, iz: number): number {
  let h = (seed ^ Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iz, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Quintic fade curve: smooth first and second derivatives at lattice cells. */
function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Smooth value noise in [0, 1). One lattice cell is one unit of input. */
export function valueNoise2D(seed: number, x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = fade(x - ix);
  const fz = fade(z - iz);
  const top = lerp(hash2(seed, ix, iz), hash2(seed, ix + 1, iz), fx);
  const bottom = lerp(hash2(seed, ix, iz + 1), hash2(seed, ix + 1, iz + 1), fx);
  return lerp(top, bottom, fz);
}

/**
 * Fractal noise: several octaves of value noise, each at double the frequency
 * and half the amplitude of the previous one. Returns a value in [0, 1).
 */
export function fractalNoise2D(seed: number, x: number, z: number, octaves = 4): number {
  let sum = 0;
  let amplitude = 1;
  let frequency = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise2D(seed + i * 1013, x * frequency, z * frequency) * amplitude;
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return sum / norm;
}

/** Hermite smoothstep: 0 at `edge0`, 1 at `edge1`, smooth in between. */
export function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
