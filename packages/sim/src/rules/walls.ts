import { BUILDINGS, isBuildingId, isWall, WALL_RULES, type BuildingId } from '@roe/game-data';
import type { HeightField, Vec2 } from '@roe/shared';
import { toPlacedFootprint, type BuildingInstance, type GameState } from '../state/gameState.js';
import { createStateHeights } from '../state/stateHeights.js';
import type { SimWorld } from '../world/createWorld.js';
import { checkGround, type PlacementIssue } from './placement.js';

/** Why a whole wall line can't be drawn (single segments fail with placement issues). */
export type WallIssue =
  /** Not a wall type, or the ends aren't grid points on one of the 8 directions. */
  | 'badWall'
  | 'wallTooLong'
  /** Every segment of the line already stands. */
  | 'wallExists';

/** The 8 wall directions, 45° apart: east first, then counterclockwise (north is −Z). */
const DIRECTIONS = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
] as const;

const { segmentLength: STEP, maxSegments: MAX } = WALL_RULES;

export interface WallSegment {
  x: number;
  z: number;
  /** Local X (the segment's length) along the line; radians, a multiple of 45°. */
  rotation: number;
}

export interface PlannedSegment extends WallSegment {
  /** `exists`: this piece of wall already stands; it is skipped and not charged. */
  status: 'ok' | 'exists' | 'blocked';
  /** The placement rules a blocked segment fails. */
  issues: PlacementIssue[];
}

export interface WallPlan {
  /** Why nothing of the line can be drawn, or null. */
  issue: WallIssue | null;
  segments: PlannedSegment[];
}

/**
 * Where a drag from `from` toward `to` ends up: both ends on the 1-unit grid, the line
 * in the nearest of the 8 directions, a whole number of segments long (at least one, at
 * most `maxSegments`). The client previews exactly this line.
 */
export function snapWallLine(from: Vec2, to: Vec2): { from: Vec2; to: Vec2 } {
  // Adding 0 turns −0 into 0.
  const start = { x: Math.round(from.x) + 0, z: Math.round(from.z) + 0 };
  // A drag that stays on the start point points east (rounding noise gives no direction).
  const still = Math.round(to.x) === start.x && Math.round(to.z) === start.z;
  const dx = still ? 0 : to.x - start.x;
  const dz = still ? 0 : to.z - start.z;
  const turn = Math.round(Math.atan2(-dz, dx) / (Math.PI / 4));
  const [ux, uz] = DIRECTIONS[((turn % 8) + 8) % 8] as readonly [number, number];
  // Steps along the direction: the drag projected onto one step's vector.
  const along = (dx * ux + dz * uz) / ((ux * ux + uz * uz) * STEP);
  const count = Math.max(1, Math.min(MAX, Math.round(along)));
  return {
    from: start,
    to: { x: start.x + ux * STEP * count, z: start.z + uz * STEP * count },
  };
}

/** The segments of the line from `from` to `to`, or why it isn't a wall line. */
export function wallSegments(from: Vec2, to: Vec2): WallSegment[] | WallIssue {
  if (![from.x, from.z, to.x, to.z].every(Number.isSafeInteger)) return 'badWall';
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const straight = dx === 0 || dz === 0;
  const reach = Math.max(Math.abs(dx), Math.abs(dz));
  if (reach === 0 || (!straight && Math.abs(dx) !== Math.abs(dz)) || reach % STEP !== 0) {
    return 'badWall';
  }
  const count = reach / STEP;
  if (count > MAX) return 'wallTooLong';
  const ux = Math.sign(dx);
  const uz = Math.sign(dz);
  // The same piece of wall gets the same rotation whichever end the drag started at.
  const turn = DIRECTIONS.findIndex(([x, z]) => x === ux && z === uz) % 4;
  const rotation = turn * (Math.PI / 4);
  return Array.from({ length: count }, (_, i) => ({
    x: from.x + ux * (STEP * i + STEP / 2),
    z: from.z + uz * (STEP * i + STEP / 2),
    rotation,
  }));
}

/** Which of the 4 axes a wall segment runs along. */
const axisOf = (rotation: number) => ((Math.round(rotation / (Math.PI / 4)) % 4) + 4) % 4;

const sameSegment = (wall: BuildingInstance, segment: WallSegment) =>
  wall.x === segment.x &&
  wall.z === segment.z &&
  axisOf(wall.rotation) === axisOf(segment.rotation);

/**
 * Plans a wall line: each segment is checked against the ground on its own, so the valid
 * ones can be built around an obstacle. Pure and deterministic: the client preview and
 * the command run exactly this.
 */
export function planWall(
  world: SimWorld,
  state: GameState,
  building: BuildingId,
  from: Vec2,
  to: Vec2,
  heights: HeightField = createStateHeights(world, state),
): WallPlan {
  if (!isBuildingId(building) || !isWall(building)) return { issue: 'badWall', segments: [] };
  const line = wallSegments(from, to);
  if (typeof line === 'string') return { issue: line, segments: [] };

  const walls = state.buildings.filter((b) => isWall(b.type));
  const segments = line.map((segment): PlannedSegment => {
    if (walls.some((wall) => sameSegment(wall, segment))) {
      return { ...segment, status: 'exists', issues: [] };
    }
    const area = toPlacedFootprint({ type: building, ...segment });
    const issues = checkGround(world, state, area, heights, { wall: true });
    return { ...segment, status: issues.length === 0 ? 'ok' : 'blocked', issues };
  });
  const issue = segments.every((s) => s.status === 'exists') ? 'wallExists' : null;
  return { issue, segments };
}

/** The cost of the segments a plan would build. */
export function wallCost(building: BuildingId, plan: WallPlan) {
  const count = plan.segments.filter((s) => s.status === 'ok').length;
  return Object.fromEntries(
    Object.entries(BUILDINGS[building].cost).map(([id, amount]) => [id, amount * count]),
  );
}
