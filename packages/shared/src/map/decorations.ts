import { fractalNoise2D, smoothstep } from '../noise.js';
import { createRng, randomRange, type Rng } from '../random.js';
import { createHeightField, isInSettlementArea, type HeightField } from './terrain.js';
import type { Decoration, DecorationRule, MapDefinition } from './types.js';

/** Distance kept free on both sides of the playable-area edge. */
const EDGE_MARGIN = 3;
/** Seed offset so the forest mask is independent of the hill noise. */
const FOREST_SEED_OFFSET = 0x5f0e57;
/** Border forest density outside the forest mask (it is dense everywhere). */
const BORDER_BASE_DENSITY = 0.45;
/** Relative mountain height where the treeline starts and where trees stop. */
const TREELINE_START = 0.75;
const TREELINE_END = 0.95;

function forestMask(map: MapDefinition, x: number, z: number): number {
  const { scale, threshold } = map.forest;
  const mask = fractalNoise2D(map.seed + FOREST_SEED_OFFSET, x / scale, z / scale, 3);
  return smoothstep(threshold, threshold + 0.1, mask);
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

/** Half-size of the square a rule samples candidate points from. */
function samplingHalfSize(map: MapDefinition, rule: DecorationRule): number {
  const playableHalf = map.size / 2;
  return rule.placement === 'border'
    ? playableHalf + map.border.width - EDGE_MARGIN
    : playableHalf - EDGE_MARGIN;
}

/** Probability (0–1) that a candidate point is kept. */
function placementChance(
  map: MapDefinition,
  rule: DecorationRule,
  x: number,
  y: number,
  z: number,
) {
  switch (rule.placement) {
    case 'scatter':
      return isInSettlementArea(map, x, z) ? 0 : 1;
    case 'forest':
      return isInSettlementArea(map, x, z)
        ? 0
        : Math.max(map.forest.strayChance, forestMask(map, x, z));
    case 'border': {
      const inRing = Math.max(Math.abs(x), Math.abs(z)) > map.size / 2 + EDGE_MARGIN;
      if (!inRing) return 0;
      const density = BORDER_BASE_DENSITY + (1 - BORDER_BASE_DENSITY) * forestMask(map, x, z);
      const altitude = y / map.border.mountainHeight;
      return density * (1 - smoothstep(TREELINE_START, TREELINE_END, altitude));
    }
  }
}

function tryPlace(
  map: MapDefinition,
  rule: DecorationRule,
  rng: Rng,
  heights: HeightField,
  half: number,
): Decoration | null {
  const x = randomRange(rng, -half, half);
  const z = randomRange(rng, -half, half);
  const y = heights.getHeightAt(x, z);
  if (rng() >= placementChance(map, rule, x, y, z)) return null;
  return { kind: rule.kind, x, y, z, rotation: 0, scale: 0 };
}

export interface ScatterOptions {
  /** Terrain to place decorations on. Defaults to the map's unmodified height field. */
  heights?: HeightField;
  /** Return true where nothing may be placed (buildings, roads...). */
  isBlocked?: (x: number, z: number) => boolean;
}

/**
 * Deterministically places decorations across a map.
 * Identical input always yields identical output, so the server and all clients agree.
 */
export function scatterDecorations(map: MapDefinition, options: ScatterOptions = {}): Decoration[] {
  const rng = createRng(map.seed);
  const heights = options.heights ?? createHeightField(map);
  const isBlocked = options.isBlocked ?? (() => false);
  const result: Decoration[] = [];

  for (const rule of map.decorations) {
    const grid = createSpacingGrid(rule.minSpacing);
    const half = samplingHalfSize(map, rule);
    const maxAttempts = rule.count * 30;
    let placed = 0;

    for (let attempt = 0; attempt < maxAttempts && placed < rule.count; attempt++) {
      const candidate = tryPlace(map, rule, rng, heights, half);
      if (!candidate || isBlocked(candidate.x, candidate.z)) continue;
      if (!grid.isFree(candidate.x, candidate.z)) continue;

      grid.add(candidate.x, candidate.z);
      candidate.rotation = randomRange(rng, 0, Math.PI * 2);
      candidate.scale = randomRange(rng, rule.minScale, rule.maxScale);
      result.push(candidate);
      placed++;
    }
  }

  return result;
}
