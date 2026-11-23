import {
  createRng,
  distanceToFootprint,
  distanceToPolyline,
  fractalNoise2D,
  randomRange,
  smoothstep,
  type HeightField,
  type MapDefinition,
  type PlacedFootprint,
  type Vec2,
  type WaterMap,
} from '@roe/shared';

/** Grid cell size for grass candidates; one jittered candidate per cell. */
const TUFT_CELL = 1.05;
/** Grid cell size for flower-cluster candidates. */
const FLOWER_CELL = 2.4;
/** Ground cover extends a little into the border foothills. */
const BORDER_OVERLAP = 10;
/** Grass thins out over this distance beyond a path's edge. */
const PATH_FADE = 3;
const SEED_OFFSET = { placement: 0x6a55, meadow: 606, flowers: 707, flowerColor: 808 } as const;

export const TUFT_VARIANTS = 4;
export const FLOWER_VARIANTS = 3;

export interface GroundCoverItem {
  x: number;
  y: number;
  z: number;
  rotation: number;
  scale: number;
  /** Color variant index. */
  variant: number;
}

export interface GroundCover {
  tufts: GroundCoverItem[];
  flowers: GroundCoverItem[];
}

interface GroundCoverInput {
  map: MapDefinition;
  heights: HeightField;
  water: WaterMap;
  footprints: readonly PlacedFootprint[];
  paths: readonly {
    path: Vec2[];
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  }[];
  pathWidth: number;
  wearAt: (x: number, z: number) => number;
}

/**
 * Deterministic grass tufts and flower clusters. Density follows a meadow noise mask
 * (some grass everywhere, lush in meadows) and drops to zero on paths, buildings,
 * fields, worn ground and water.
 */
export function createGroundCover(input: GroundCoverInput): GroundCover {
  const { map, heights, water, footprints, paths, pathWidth, wearAt } = input;
  const rng = createRng(map.seed + SEED_OFFSET.placement);
  const half = map.size / 2 + BORDER_OVERLAP;
  const pathHalf = pathWidth / 2;

  const meadowAt = (x: number, z: number) =>
    smoothstep(0.35, 0.65, fractalNoise2D(map.seed + SEED_OFFSET.meadow, x / 18, z / 18, 3));

  /** 0 where nothing may grow, 1 where growth is unrestricted. */
  const openness = (x: number, z: number) => {
    if (water.isWater(x, z, 0.04)) return 0;
    if (footprints.some((f) => distanceToFootprint(f, x, z, 0.5) === 0)) return 0;
    let fromPath = Infinity;
    for (const { path, bounds } of paths) {
      if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) continue;
      fromPath = Math.min(fromPath, distanceToPolyline(path, x, z));
    }
    const pathFactor = smoothstep(pathHalf + 0.3, pathHalf + PATH_FADE, fromPath);
    return pathFactor * (1 - wearAt(x, z));
  };

  const place = (x: number, z: number, minScale: number, maxScale: number, variant: number) => ({
    x,
    y: heights.getHeightAt(x, z),
    z,
    rotation: randomRange(rng, 0, Math.PI * 2),
    scale: randomRange(rng, minScale, maxScale),
    variant,
  });

  const tufts: GroundCoverItem[] = [];
  for (let gx = -half; gx < half; gx += TUFT_CELL) {
    for (let gz = -half; gz < half; gz += TUFT_CELL) {
      const x = gx + rng() * TUFT_CELL;
      const z = gz + rng() * TUFT_CELL;
      const density = (0.22 + 0.78 * meadowAt(x, z)) * openness(x, z);
      if (rng() >= density) continue;
      tufts.push(place(x, z, 0.6, 1.05, Math.floor(rng() * TUFT_VARIANTS)));
    }
  }

  const flowers: GroundCoverItem[] = [];
  for (let gx = -half; gx < half; gx += FLOWER_CELL) {
    for (let gz = -half; gz < half; gz += FLOWER_CELL) {
      const x = gx + rng() * FLOWER_CELL;
      const z = gz + rng() * FLOWER_CELL;
      const patch = smoothstep(
        0.6,
        0.72,
        fractalNoise2D(map.seed + SEED_OFFSET.flowers, x / 14, z / 14, 2),
      );
      if (rng() >= patch * meadowAt(x, z) * openness(x, z)) continue;
      // Each flower patch keeps one dominant color, so meadows read as white, yellow or purple.
      const colorNoise = fractalNoise2D(map.seed + SEED_OFFSET.flowerColor, x / 10, z / 10, 1);
      const spread = smoothstep(0.25, 0.75, colorNoise);
      const variant = Math.min(FLOWER_VARIANTS - 1, Math.floor(spread * FLOWER_VARIANTS));
      flowers.push(place(x, z, 0.8, 1.2, variant));
    }
  }

  return { tufts, flowers };
}
