import { BUILDINGS, type BuildingDefinition, type SettlementLayout } from '@roe/game-data';
import {
  createHeightField,
  distanceToFootprint,
  distanceToPolyline,
  flattenHeightField,
  sampleCatmullRom,
  scatterDecorations,
  type Decoration,
  type HeightField,
  type MapDefinition,
  type PlacedFootprint,
  type Vec2,
} from '@roe/shared';

/** Free space kept between buildings and trees/rocks. */
const BUILDING_CLEARANCE = 3;
/** Free space kept on each side of a path, beyond its half-width. */
const PATH_CLEARANCE = 1;
const PATH_SAMPLE_SPACING = 0.5;

export interface PlacedBuilding extends PlacedFootprint {
  definition: BuildingDefinition;
  /** Ground height under the building (its flattened level). */
  y: number;
}

/** Everything static about the world, derived deterministically from map data. */
export interface World {
  map: MapDefinition;
  heights: HeightField;
  buildings: PlacedBuilding[];
  /** Sampled path center lines. */
  paths: Vec2[][];
  pathWidth: number;
  decorations: Decoration[];
}

/** Axis-aligned box around all settlement features, for a cheap "far away" reject. */
function boundsOf(points: Vec2[], margin: number) {
  const xs = points.map((p) => p.x);
  const zs = points.map((p) => p.z);
  return {
    minX: Math.min(...xs) - margin,
    maxX: Math.max(...xs) + margin,
    minZ: Math.min(...zs) - margin,
    maxZ: Math.max(...zs) + margin,
  };
}

/**
 * Composes terrain, settlement and decorations. Order matters: buildings flatten the
 * terrain first, then paths and decorations are placed on the flattened ground,
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
  const paths = settlement.paths.map((points) =>
    sampleCatmullRom(
      points.map(([x, z]) => ({ x, z })),
      PATH_SAMPLE_SPACING,
    ),
  );

  const pathReach = settlement.pathWidth / 2 + PATH_CLEARANCE;
  const bounds = boundsOf([...footprints, ...paths.flat()], 15);
  const isBlocked = (x: number, z: number) =>
    x > bounds.minX &&
    x < bounds.maxX &&
    z > bounds.minZ &&
    z < bounds.maxZ &&
    (footprints.some((f) => distanceToFootprint(f, x, z, BUILDING_CLEARANCE) === 0) ||
      paths.some((path) => distanceToPolyline(path, x, z) < pathReach));

  return {
    map,
    heights,
    paths,
    pathWidth: settlement.pathWidth,
    buildings: footprints.map((f) => ({ ...f, y: heights.getHeightAt(f.x, f.z) })),
    decorations: scatterDecorations(map, { heights, isBlocked }),
  };
}
