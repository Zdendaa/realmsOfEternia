import { PROPS, type PropDefinition, type SettlementLayout } from '@roe/game-data';
import {
  createRng,
  distanceToFootprint,
  distanceToPolyline,
  entrancePoint,
  randomRange,
  toSlotPoint,
  type HeightField,
  type MapDefinition,
  type Vec2,
} from '@roe/shared';
import { boundsOf, type PlacedBuilding, type SimWorld } from '@roe/sim';
import { createGroundCover, type GroundCover } from './groundCover';
import { createWearSampler } from './wear';
import { yardPatches } from './yards';

/** Seed offset for prop scattering, independent of other generators. */
const PROP_SEED_OFFSET = 0x9a0f;

export interface PlacedProp {
  definition: PropDefinition;
  x: number;
  y: number;
  z: number;
  rotation: number;
  /** Final uniform scale (definition scale × variation). */
  scale: number;
}

/** A soft circular patch of trampled dirt. */
export interface WornPatch {
  x: number;
  z: number;
  radius: number;
}

/**
 * The simulation world plus purely cosmetic layers. Cosmetic layers never affect
 * gameplay, so they live only in the client and are never validated by the server.
 */
export interface ClientWorld extends SimWorld {
  props: PlacedProp[];
  wornPatches: WornPatch[];
  groundCover: GroundCover;
}

/**
 * Trampled ground on squares, in front of entrances, and as dirt yards around buildings
 * that have one (`yardPatches`).
 */
function createWornPatches(
  buildings: readonly PlacedBuilding[],
  squares: SettlementLayout['squares'],
): WornPatch[] {
  const patches: WornPatch[] = squares.map((s) => ({ ...s }));
  for (const b of buildings) {
    if (b.definition.id === 'field') continue;
    if (b.definition.yard) {
      patches.push(...yardPatches(b));
      continue;
    }
    const front = entrancePoint(b, 0.8);
    patches.push({ ...front, radius: Math.min(b.footprint.w, b.footprint.d) * 0.4 });
  }
  return patches;
}

/**
 * Scatters small props behind and beside buildings (never in front of entrances),
 * keeping them off paths, other footprints and each other.
 */
function scatterProps(
  map: MapDefinition,
  layout: SettlementLayout,
  buildings: readonly PlacedBuilding[],
  paths: readonly Vec2[][],
  heights: HeightField,
): PlacedProp[] {
  const rng = createRng(map.seed + PROP_SEED_OFFSET);
  const props: PlacedProp[] = [];
  const { around, models, perBuilding } = layout.props;

  for (const building of buildings) {
    if (!around.includes(building.definition.id as (typeof around)[number])) continue;
    const count = perBuilding.min + Math.floor(rng() * (perBuilding.max - perBuilding.min + 1));

    for (let attempt = 0, placed = 0; placed < count && attempt < count * 12; attempt++) {
      // Angle relative to the entrance direction: skip the front ±60°.
      const relative = randomRange(rng, Math.PI / 3, (Math.PI * 5) / 3);
      const angle = building.rotation + relative;
      const reach = Math.max(building.footprint.w, building.footprint.d) / 2;
      const distance = reach + randomRange(rng, 0.6, 2.2);
      const x = building.x + Math.sin(angle) * distance;
      const z = building.z + Math.cos(angle) * distance;
      const model = models[Math.floor(rng() * models.length)];
      const rotation = randomRange(rng, 0, Math.PI * 2);
      const variation = randomRange(rng, 0.8, 1.2);
      if (!model) continue;

      const blocked =
        buildings.some((b) => distanceToFootprint(b, x, z, 0.4) === 0) ||
        paths.some((p) => distanceToPolyline(p, x, z) < layout.pathWidth / 2 + 0.6) ||
        props.some((p) => Math.hypot(p.x - x, p.z - z) < 1.6);
      if (blocked) continue;

      const definition = PROPS[model];
      props.push({
        definition,
        x,
        y: heights.getHeightAt(x, z),
        z,
        rotation,
        scale: definition.scale * variation,
      });
      placed++;
    }
  }
  return props;
}

/** Adds the cosmetic layers (props, worn ground, grass and flowers) to a simulation world. */
export function decorateWorld(world: SimWorld, settlement: SettlementLayout): ClientWorld {
  const { map, heights, buildings, paths, water } = world;
  const squares = world.slots.flatMap((slot) =>
    settlement.squares.map((square) => ({ ...toSlotPoint(slot, square), radius: square.radius })),
  );
  const wornPatches = createWornPatches(buildings, squares);
  const groundCover = createGroundCover({
    map,
    heights,
    water,
    footprints: buildings,
    // Bounds must cover the whole fade band beside a path (half-width + 3 units).
    paths: paths.map((path) => ({ path, bounds: boundsOf(path, world.pathWidth / 2 + 4) })),
    pathWidth: world.pathWidth,
    wearAt: createWearSampler(map, wornPatches),
  });

  return {
    ...world,
    props: scatterProps(map, settlement, buildings, paths, heights),
    wornPatches,
    groundCover,
  };
}
