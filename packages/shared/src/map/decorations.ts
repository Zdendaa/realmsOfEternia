import { fractalNoise2D, smoothstep } from '../noise.js';
import { createRng, randomRange, type Rng } from '../random.js';
import { createHeightField, isInSettlementArea } from './terrain.js';
import type { Decoration, DecorationRule, MapDefinition } from './types.js';

/** Distance kept free along the map border. */
const BORDER_MARGIN = 4;
/** Seed offset so the forest mask is independent of the hill noise. */
const FOREST_SEED_OFFSET = 0x5f0e57;

/** Forest density (0–1) at a point, from a low-frequency noise mask. */
function forestDensity(map: MapDefinition, x: number, z: number): number {
  const { scale, threshold, strayChance } = map.forest;
  const mask = fractalNoise2D(map.seed + FOREST_SEED_OFFSET, x / scale, z / scale, 3);
  return Math.max(strayChance, smoothstep(threshold, threshold + 0.1, mask));
}

/** Uniform grid for fast "is anything within minSpacing?" checks. */
function createSpacingGrid(spacing: number) {
  const cells = new Map<string, { x: number; z: number }[]>();
  const key = (cx: number, cz: number) => `${cx},${cz}`;

  return {
    isFree(x: number, z: number): boolean {
      const cx = Math.floor(x / spacing);
      const cz = Math.floor(z / spacing);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          for (const p of cells.get(key(cx + dx, cz + dz)) ?? []) {
            if (Math.hypot(p.x - x, p.z - z) < spacing) return false;
          }
        }
      }
      return true;
    },
    add(x: number, z: number): void {
      const k = key(Math.floor(x / spacing), Math.floor(z / spacing));
      const cell = cells.get(k);
      if (cell) cell.push({ x, z });
      else cells.set(k, [{ x, z }]);
    },
  };
}

function acceptsPoint(map: MapDefinition, rule: DecorationRule, rng: Rng, x: number, z: number) {
  if (isInSettlementArea(map, x, z)) return false;
  return rule.placement === 'scatter' || rng() < forestDensity(map, x, z);
}

/**
 * Deterministically places decorations across a map.
 * Identical input always yields identical output, so the server and all clients agree.
 */
export function scatterDecorations(map: MapDefinition): Decoration[] {
  const rng = createRng(map.seed);
  const heights = createHeightField(map);
  const half = map.size / 2 - BORDER_MARGIN;
  const result: Decoration[] = [];

  for (const rule of map.decorations) {
    const grid = createSpacingGrid(rule.minSpacing);
    const maxAttempts = rule.count * 30;
    let placed = 0;

    for (let attempt = 0; attempt < maxAttempts && placed < rule.count; attempt++) {
      const x = randomRange(rng, -half, half);
      const z = randomRange(rng, -half, half);
      if (!acceptsPoint(map, rule, rng, x, z) || !grid.isFree(x, z)) continue;

      grid.add(x, z);
      result.push({
        kind: rule.kind,
        x,
        y: heights.getHeightAt(x, z),
        z,
        rotation: randomRange(rng, 0, Math.PI * 2),
        scale: randomRange(rng, rule.minScale, rule.maxScale),
      });
      placed++;
    }
  }

  return result;
}
