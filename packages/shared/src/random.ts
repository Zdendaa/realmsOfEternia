/** A deterministic pseudo-random number generator returning values in [0, 1). */
export type Rng = () => number;

/**
 * Creates a seeded PRNG (mulberry32).
 *
 * Game rules must never use `Math.random()`: the same seed has to produce the same
 * result on every client and on the server.
 */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Returns a float in [min, max). */
export function randomRange(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}
