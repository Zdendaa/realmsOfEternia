import { BUILDINGS, isBuildingId } from '@roe/game-data';
import {
  distanceToFootprint,
  footprintBounds,
  footprintHeightRange,
  footprintsOverlap,
  isInPlayableArea,
  sampleFootprint,
  type HeightField,
  type PlacedFootprint,
} from '@roe/shared';
import type { PlaceBuildingCommand } from '../commands/types.js';
import { toPlacedFootprint, type GameState } from '../state/gameState.js';
import { createStateHeights } from '../state/stateHeights.js';
import type { SimWorld } from '../world/createWorld.js';

/** Tunable placement rules. The server and the client preview use the same values. */
export const PLACEMENT_RULES = {
  /** Building centers snap to this grid (world units). */
  gridSize: 1,
  /** Maximum terrain height difference under a footprint before flattening. */
  maxHeightDifference: 1.5,
  /** Minimum free space between two buildings. */
  buildingGap: 1,
  /** Minimum free space between a building and the edge of a path. */
  pathGap: 0.5,
  /** Blocking radius of a tree / rock at scale 1 (world units). */
  treeRadius: 0.6,
  rockRadius: 0.9,
  /** Keep construction this far (lake-radius fractions) from the shoreline. */
  shoreMargin: 0.15,
} as const;

export type PlacementIssue =
  | 'unknownBuilding'
  | 'notBuildable'
  | 'offGrid'
  | 'badRotation'
  | 'outOfBounds'
  | 'water'
  | 'slope'
  | 'building'
  | 'path'
  | 'tree'
  | 'rock';

export interface PlacementCheck {
  ok: boolean;
  /** Every rule that failed, in check order. Empty when `ok`. */
  issues: PlacementIssue[];
}

/** Rotation in radians for a number of 90° steps. */
export const quarterTurnsToRadians = (quarterTurns: number) => (quarterTurns * Math.PI) / 2;

const isOnGrid = (v: number) =>
  Number.isFinite(v) &&
  Math.abs(v / PLACEMENT_RULES.gridSize - Math.round(v / PLACEMENT_RULES.gridSize)) < 1e-9;

/**
 * Validates a building placement against the world and current state. Pure and
 * deterministic: the client preview and the server run exactly this function.
 * `heights` can be passed in when the caller caches the state heights.
 */
export function checkPlacement(
  world: SimWorld,
  state: GameState,
  command: PlaceBuildingCommand,
  heights: HeightField = createStateHeights(world, state),
): PlacementCheck {
  if (!isBuildingId(command.building)) return { ok: false, issues: ['unknownBuilding'] };
  const definition = BUILDINGS[command.building];
  const issues: PlacementIssue[] = [];

  if (!definition.buildable) issues.push('notBuildable');
  if (!isOnGrid(command.x) || !isOnGrid(command.z)) issues.push('offGrid');
  if (
    !Number.isInteger(command.quarterTurns) ||
    command.quarterTurns < 0 ||
    command.quarterTurns > 3
  ) {
    issues.push('badRotation');
  }
  // Without a valid position the geometric checks are meaningless.
  if (!Number.isFinite(command.x) || !Number.isFinite(command.z)) return { ok: false, issues };

  const area: PlacedFootprint = {
    x: command.x,
    z: command.z,
    rotation: quarterTurnsToRadians(Math.round(command.quarterTurns) % 4),
    footprint: definition.footprint,
  };
  const samples = sampleFootprint(area, 1);

  if (samples.some((p) => !isInPlayableArea(world.map, p.x, p.z))) issues.push('outOfBounds');
  if (samples.some((p) => world.water.isWater(p.x, p.z, PLACEMENT_RULES.shoreMargin))) {
    issues.push('water');
  }

  const range = footprintHeightRange(heights, area, 1);
  if (range.max - range.min > PLACEMENT_RULES.maxHeightDifference) issues.push('slope');

  if (
    state.buildings.some((b) =>
      footprintsOverlap(area, toPlacedFootprint(b), PLACEMENT_RULES.buildingGap),
    )
  ) {
    issues.push('building');
  }

  const pathReach = world.pathWidth / 2 + PLACEMENT_RULES.pathGap;
  const nearPath = world.pathIndex.query(footprintBounds(area, pathReach));
  if (nearPath.some((p) => distanceToFootprint(area, p.x, p.z) < pathReach)) issues.push('path');

  const maxRadius = Math.max(PLACEMENT_RULES.treeRadius, PLACEMENT_RULES.rockRadius) * 2;
  const nearObstacles = world.obstacleIndex.query(footprintBounds(area, maxRadius));
  for (const kind of ['tree', 'rock'] as const) {
    const radius = kind === 'tree' ? PLACEMENT_RULES.treeRadius : PLACEMENT_RULES.rockRadius;
    const blocked = nearObstacles.some(
      (d) =>
        d.kind === kind &&
        state.resourceNodes[d.id] !== 0 && // depleted trees and rocks are gone
        distanceToFootprint(area, d.x, d.z) < radius * d.scale,
    );
    if (blocked) issues.push(kind);
  }

  return { ok: issues.length === 0, issues };
}
