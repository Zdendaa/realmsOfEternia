import { UNITS, type BuildingId } from '@roe/game-data';
import type { PlayerId, Vec2 } from '@roe/shared';
import type { SimContext } from '../context/simContext.js';
import { workSlots } from '../construction/workSlots.js';
import { addBuilding, isWalkableCell, nearestWalkableCell, type NavGrid } from '../nav/navGrid.js';
import { toPlacedFootprint, type GameState } from '../state/gameState.js';
import { isAlive } from '../state/units.js';
import type { WallSegment } from './walls.js';

/** What a new wall would shut away from the rest of the map. */
export interface CutOff {
  /** The player's units that could walk out before and couldn't afterwards. */
  units: number;
  /** The player's construction sites (new wall segments included) builders couldn't reach. */
  sites: number;
}

/**
 * For every walkable cell the id of its connected region, and the id of the largest one
 * ("the rest of the map"). 4-neighbours are enough: paths never cut corners.
 */
function regions(grid: NavGrid): { of: Int32Array; main: number } {
  const { cols, rows } = grid;
  const of = new Int32Array(cols * rows);
  const stack = new Int32Array(cols * rows);
  let id = 0;
  let main = 0;
  let largest = 0;
  for (let start = 0; start < of.length; start++) {
    if (of[start] !== 0 || !isWalkableCell(grid, start)) continue;
    id++;
    let size = 0;
    let top = 0;
    stack[top++] = start;
    of[start] = id;
    const visit = (next: number) => {
      if (of[next] === 0 && isWalkableCell(grid, next)) {
        of[next] = id;
        stack[top++] = next;
      }
    };
    while (top > 0) {
      const cell = stack[--top] as number;
      size++;
      const col = cell % cols;
      if (col > 0) visit(cell - 1);
      if (col < cols - 1) visit(cell + 1);
      if (cell >= cols) visit(cell - cols);
      if (cell < cols * (rows - 1)) visit(cell + cols);
    }
    if (size > largest) {
      largest = size;
      main = id;
    }
  }
  return { of, main };
}

/**
 * Which of `player`'s units and construction sites the new wall `segments` would cut off
 * from the rest of the map. A warning for the one drawing the wall, not a rule: walling
 * yourself in is allowed. Costs two flood fills of the nav grid (call it when the line
 * changes, not every frame). `ctx` must be synced to `state`.
 */
export function findCutOff(
  ctx: SimContext,
  state: GameState,
  player: PlayerId,
  building: BuildingId,
  segments: readonly WallSegment[],
): CutOff {
  if (segments.length === 0) return { units: 0, sites: 0 };
  const walls = segments.map((segment) => ({ type: building, ...segment }));
  const after: NavGrid = { ...ctx.nav, flags: ctx.nav.flags.slice() };
  for (const wall of walls) addBuilding(after, toPlacedFootprint(wall));

  const before = regions(ctx.nav);
  const walled = regions(after);
  const connected = (grid: NavGrid, found: typeof before, at: Vec2) => {
    const cell = nearestWalkableCell(grid, at.x, at.z);
    return cell >= 0 && found.of[cell] === found.main;
  };
  const lost = (points: readonly Vec2[]) =>
    points.some((p) => connected(ctx.nav, before, p)) &&
    !points.some((p) => connected(after, walled, p));

  const units = state.units.filter(
    // Units that move on foot and belong to the player.
    (u) => u.ownerId === player && isAlive(u) && UNITS[u.type].speed > 0 && lost([u]),
  ).length;

  const standing = state.buildings.filter(
    (b) => b.ownerId === player && b.status === 'construction' && lost(workSlots(b)),
  ).length;
  // A new segment has no "before" of its own: it counts when no work slot is connected.
  const fresh = walls.filter(
    (wall) => !workSlots(wall).some((p) => connected(after, walled, p)),
  ).length;
  return { units, sites: standing + fresh };
}
