import {
  BUILDINGS,
  PROPS,
  type BuildingDefinition,
  type PropDefinition,
  type SettlementLayout,
} from '@roe/game-data';
import {
  createHeightField,
  createBaseHeightField,
  createWaterMap,
  createRng,
  distanceToFootprint,
  distanceToPolyline,
  entrancePoint,
  flattenHeightField,
  randomRange,
  sampleCatmullRom,
  scatterDecorations,
  type Decoration,
  type HeightField,
  type Lake,
  type MapDefinition,
  type PlacedFootprint,
  type Vec2,
} from '@roe/shared';

/** Free space kept between buildings and trees/rocks. */
const BUILDING_CLEARANCE = 3;
/** Free space kept on each side of a path, beyond its half-width. */
const PATH_CLEARANCE = 1;
const PATH_SAMPLE_SPACING = 0.5;
/** Seed offset for prop scattering, independent of other generators. */
const PROP_SEED_OFFSET = 0x9a0f;

export interface PlacedBuilding extends PlacedFootprint {
  definition: BuildingDefinition;
  /** Ground height under the building (its flattened level). */
  y: number;
}

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

/** Everything static about the world, derived deterministically from map data. */
export interface World {
  map: MapDefinition;
  heights: HeightField;
  buildings: PlacedBuilding[];
  props: PlacedProp[];
  /** Sampled path center lines. */
  paths: Vec2[][];
  pathWidth: number;
  wornPatches: WornPatch[];
  /** Lakes with resolved water levels (already carved into `heights`). */
  lakes: readonly Lake[];
  decorations: Decoration[];
}

interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function boundsOf(points: readonly Vec2[], margin: number): Bounds {
  const xs = points.map((p) => p.x);
  const zs = points.map((p) => p.z);
  return {
    minX: Math.min(...xs) - margin,
    maxX: Math.max(...xs) + margin,
    minZ: Math.min(...zs) - margin,
    maxZ: Math.max(...zs) + margin,
  };
}

const inBounds = (b: Bounds, x: number, z: number) =>
  x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ;

/** Trampled ground in front of entrances, around the Town Hall and on squares. */
function createWornPatches(
  buildings: readonly PlacedBuilding[],
  squares: SettlementLayout['squares'],
): WornPatch[] {
  const patches: WornPatch[] = squares.map((s) => ({ ...s }));
  for (const b of buildings) {
    if (b.definition.id === 'farmPlot') continue;
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

/**
 * Composes terrain, settlement and decorations. Order matters: buildings flatten the
 * terrain first, then paths, props and decorations are placed on the flattened ground,
 * keeping clear of buildings and paths.
 */
export function createWorld(map: MapDefinition, settlement: SettlementLayout): World {
  const footprints = settlement.buildings.map((placement) => {
    const definition = BUILDINGS[placement.building];
    return {
      definition,
      x: placement.x,
      z: placement.z,
      rotation: placement.rotation,
      footprint: definition.footprint,
    };
  });

  const heights = flattenHeightField(createHeightField(map), footprints);
  const buildings = footprints.map((f) => ({ ...f, y: heights.getHeightAt(f.x, f.z) }));
  const paths = settlement.paths.map((points) => sampleCatmullRom(points, PATH_SAMPLE_SPACING));

  // Roads cross the whole map, so each path gets its own bounding box for a cheap reject.
  const pathReach = settlement.pathWidth / 2 + PATH_CLEARANCE;
  const pathChecks = paths.map((path) => ({ path, bounds: boundsOf(path, pathReach) }));
  const buildingBounds = boundsOf(footprints, 12);
  const isBlocked = (x: number, z: number) =>
    (inBounds(buildingBounds, x, z) &&
      footprints.some((f) => distanceToFootprint(f, x, z, BUILDING_CLEARANCE) === 0)) ||
    pathChecks.some(
      ({ path, bounds }) => inBounds(bounds, x, z) && distanceToPolyline(path, x, z) < pathReach,
    );

  return {
    map,
    heights,
    buildings,
    props: scatterProps(map, settlement, buildings, paths, heights),
    paths,
    pathWidth: settlement.pathWidth,
    wornPatches: createWornPatches(buildings, settlement.squares),
    lakes: createWaterMap(map, createBaseHeightField(map)).lakes,
    decorations: scatterDecorations(map, { heights, isBlocked }),
  };
}
