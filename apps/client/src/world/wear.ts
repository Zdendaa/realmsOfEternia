import { fractalNoise2D, smoothstep, type MapDefinition } from '@roe/shared';
import type { WornPatch } from './decorateWorld';

/** Wear amount (0–1) at a point: strongest at patch centers, ragged at the edges. */
export function createWearSampler(map: MapDefinition, patches: readonly WornPatch[]) {
  return (x: number, z: number): number => {
    let wear = 0;
    for (const p of patches) {
      const distance = Math.hypot(x - p.x, z - p.z);
      if (distance < p.radius) {
        wear = Math.max(wear, 1 - smoothstep(p.radius * 0.35, p.radius, distance));
      }
    }
    if (wear === 0) return 0;
    const ragged = fractalNoise2D(map.seed + 404, x / 1.6, z / 1.6, 2);
    return smoothstep(0.15, 0.75, wear * (0.55 + ragged * 0.9));
  };
}
