import { BUILDINGS, type BuildingDefinition, type SettlementLayout } from '@roe/game-data';
import {
  createBaseHeightField,
  createHeightField,
  createWaterMap,
  distanceToFootprint,
  distanceToPolyline,
  flattenHeightField,
  sampleCatmullRom,
  scatterDecorations,
  startSlotsOf,
  toSlotPoint,
  type Decoration,
  type StartSlotDefinition,
  type DepositDefinition,
  type HeightField,
  type MapDefinition,
  type PlacedFootprint,
  type Vec2,
  type WaterMap,
} from '@roe/shared';
import { createPointGrid, type PointGrid } from '../spatial/pointGrid.js';

/** Free space kept between buildings and trees/rocks. */
const BUILDING_CLEARANCE = 3;
/** Free space kept on each side of a path, beyond its half-width. */
const PATH_CLEARANCE = 1;
const PATH_SAMPLE_SPACING = 0.5;
/** Cell size of the spatial indexes. */
const OBSTACLE_CELL = 8;
/**
 * Trees and rocks keep this far beyond a deposit's radius, so a mine (centered anywhere on
 * the deposit; half-diagonal ~5.35) always has room.
 */
const DEPOSIT_CLEARANCE = 6;

export interface PlacedBuilding extends PlacedFootprint {
  definition: BuildingDefinition;
  /** Ground height under the building (its flattened level). */
  y: number;
  /** The start slot whose settlement it belongs to. */
  slot: number;
}

/** A start slot with a starting settlement. */
export type WorldSlot = StartSlotDefinition & { index: number };

export interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * The static, gameplay-relevant world derived deterministically from map data.
 * Identical on client and server; cosmetic layers (props, grass...) live in the client.
 */
export interface SimWorld {
  map: MapDefinition;
  /** Natural terrain with lakes carved in, before any building flattening. */
  terrain: HeightField;
  /** Terrain flattened under the starting settlement. */
  heights: HeightField;
  water: WaterMap;
  /** The occupied start slots, in slot order. */
  slots: readonly WorldSlot[];
  /** The starting settlements, slot by slot. */
  buildings: PlacedBuilding[];
  /** Sampled path center lines. */
  paths: Vec2[][];
  pathWidth: number;
  /** Trees and rocks, with stable ids. */
  decorations: Decoration[];
  /** Spatial index of trees and rocks, for placement checks. */
  obstacleIndex: PointGrid<Decoration>;
  /** Spatial index of all sampled path points. */
  pathIndex: PointGrid<Vec2>;
  /** Ore deposits of the map (mines are built on them). */
  deposits: readonly DepositDefinition[];
  /** Serfs that start next to each slot's Town Hall. */
  startingSerfs: number;
}

export function boundsOf(points: readonly Vec2[], margin: number): Bounds {
  const xs = points.map((p) => p.x);
  const zs = points.map((p) => p.z);
  return {
    minX: Math.min(...xs) - margin,
    maxX: Math.max(...xs) + margin,
    minZ: Math.min(...zs) - margin,
    maxZ: Math.max(...zs) + margin,
  };
}

export const inBounds = (b: Bounds, x: number, z: number) =>
  x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ;

/**
 * Composes terrain, settlements and decorations. The settlement is built at each of
 * `occupied` start slots (default: all of the map's), turned as the slot says. Order
 * matters: buildings flatten the terrain first, then paths are sampled and decorations are
 * placed on the flattened ground, keeping clear of buildings, paths and ore deposits.
 */
export function createWorld(
  map: MapDefinition,
  settlement: SettlementLayout,
  occupied?: readonly number[],
): SimWorld {
  const slots: WorldSlot[] = startSlotsOf(map)
    .map((slot, index) => ({ ...slot, index }))
    .filter((slot) => occupied?.includes(slot.index) ?? true);
  const footprints = slots.flatMap((slot) =>
    settlement.buildings.map((placement) => {
      const definition = BUILDINGS[placement.building];
      return {
        definition,
        ...toSlotPoint(slot, placement),
        rotation: placement.rotation + (slot.quarterTurns * Math.PI) / 2,
        footprint: definition.footprint,
        slot: slot.index,
      };
    }),
  );

  const terrain = createHeightField(map);
  const heights = flattenHeightField(terrain, footprints);
  const buildings = footprints.map((f) => ({ ...f, y: heights.getHeightAt(f.x, f.z) }));
  const paths = slots.flatMap((slot) =>
    settlement.paths.map((points) =>
      sampleCatmullRom(
        points.map((p) => toSlotPoint(slot, p)),
        PATH_SAMPLE_SPACING,
      ),
    ),
  );

  // Roads cross the whole map, so each path gets its own bounding box for a cheap reject.
  const pathReach = settlement.pathWidth / 2 + PATH_CLEARANCE;
  const pathChecks = paths.map((path) => ({ path, bounds: boundsOf(path, pathReach) }));
  // One box per settlement, so the empty land between them is rejected cheaply.
  const settlementChecks = slots.map((slot) => {
    const own = footprints.filter((f) => f.slot === slot.index);
    return { own, bounds: boundsOf(own, 12) };
  });
  const deposits = map.deposits ?? [];
  const onDeposit = (x: number, z: number) =>
    deposits.some((d) => Math.hypot(d.x - x, d.z - z) < d.radius + DEPOSIT_CLEARANCE);
  const isBlocked = (x: number, z: number) =>
    onDeposit(x, z) ||
    settlementChecks.some(
      ({ own, bounds }) =>
        inBounds(bounds, x, z) &&
        own.some((f) => distanceToFootprint(f, x, z, BUILDING_CLEARANCE) === 0),
    ) ||
    pathChecks.some(
      ({ path, bounds }) => inBounds(bounds, x, z) && distanceToPolyline(path, x, z) < pathReach,
    );

  const decorations = scatterDecorations(map, { heights, isBlocked });

  return {
    map,
    terrain,
    heights,
    water: createWaterMap(map, createBaseHeightField(map)),
    slots,
    buildings,
    paths,
    pathWidth: settlement.pathWidth,
    decorations,
    obstacleIndex: createPointGrid(decorations, OBSTACLE_CELL),
    pathIndex: createPointGrid(paths.flat(), OBSTACLE_CELL),
    deposits,
    startingSerfs: settlement.startingSerfs,
  };
}
