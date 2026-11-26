import { buildingSightOf, HERO_RULES, UNITS } from '@roe/game-data';
import type { EntityId, MapDefinition, PlayerId, Vec2 } from '@roe/shared';
import { toPlacedFootprint, type BuildingInstance, type GameState } from '../state/gameState.js';
import { isAlive } from '../state/units.js';

/** Edge of one vision cell in world units. */
export const VISION_CELL = 2;

/** Where a sight circle is stamped: its center cell and its radius in world units. */
interface Stamp {
  cell: number;
  radius: number;
}

/**
 * What one player sees, as a grid over the map (square cells of `VISION_CELL`):
 * - `counts`: how many of the player's sight circles cover each cell (> 0: visible);
 * - `explored`: 1 for cells the player has ever seen;
 * - `lastSeen`: other players' (and neutral) buildings as the player last saw them, by
 *   id. A building destroyed out of sight stays here until its spot is seen again.
 *
 * A cache derived from the game state (like `SimContext`), not state itself: it is
 * updated incrementally after every tick and never sent whole. `version` changes
 * whenever a cell turns visible, hidden or explored, so renderers know when to upload.
 */
export interface Vision {
  readonly player: PlayerId;
  readonly columns: number;
  readonly rows: number;
  /** World position of the grid's corner (cell 0, 0). */
  readonly originX: number;
  readonly originZ: number;
  readonly counts: Uint16Array;
  readonly explored: Uint8Array;
  readonly lastSeen: Map<EntityId, BuildingInstance>;
  version: number;
  /** The circle each of the player's units and buildings has stamped, by entity id. */
  readonly stamps: Map<EntityId, Stamp>;
}

export function createVision(map: MapDefinition, player: PlayerId): Vision {
  const columns = Math.ceil(map.size / VISION_CELL);
  return {
    player,
    columns,
    rows: columns,
    originX: -map.size / 2,
    originZ: -map.size / 2,
    counts: new Uint16Array(columns * columns),
    explored: new Uint8Array(columns * columns),
    lastSeen: new Map(),
    version: 0,
    stamps: new Map(),
  };
}

/** Index of the cell containing (x, z), clamped to the grid. */
export function cellAt(vision: Vision, x: number, z: number): number {
  const cx = Math.min(
    vision.columns - 1,
    Math.max(0, Math.floor((x - vision.originX) / VISION_CELL)),
  );
  const cz = Math.min(vision.rows - 1, Math.max(0, Math.floor((z - vision.originZ) / VISION_CELL)));
  return cz * vision.columns + cx;
}

export const isVisible = (vision: Vision, x: number, z: number) =>
  (vision.counts[cellAt(vision, x, z)] ?? 0) > 0;

export const isExplored = (vision: Vision, x: number, z: number) =>
  (vision.explored[cellAt(vision, x, z)] ?? 0) > 0;

/** Cell offsets (dx, dz pairs) within `radius` world units, cached per radius. */
const circles = new Map<number, Int16Array>();
function circle(radius: number): Int16Array {
  let offsets = circles.get(radius);
  if (offsets) return offsets;
  const reach = Math.ceil(radius / VISION_CELL);
  const list: number[] = [];
  for (let dz = -reach; dz <= reach; dz++) {
    for (let dx = -reach; dx <= reach; dx++) {
      if ((dx * dx + dz * dz) * VISION_CELL * VISION_CELL <= radius * radius) list.push(dx, dz);
    }
  }
  offsets = Int16Array.from(list);
  circles.set(radius, offsets);
  return offsets;
}

/** Adds (+1) or removes (−1) one sight circle around `cell`. */
function stamp(vision: Vision, cell: number, radius: number, delta: 1 | -1): void {
  const offsets = circle(radius);
  const cx = cell % vision.columns;
  const cz = Math.floor(cell / vision.columns);
  for (let i = 0; i < offsets.length; i += 2) {
    const x = cx + (offsets[i] as number);
    const z = cz + (offsets[i + 1] as number);
    if (x < 0 || z < 0 || x >= vision.columns || z >= vision.rows) continue;
    const index = z * vision.columns + x;
    const before = vision.counts[index] as number;
    const after = before + delta;
    vision.counts[index] = after;
    if (before === 0 || after === 0) vision.version++;
    if (after > 0 && vision.explored[index] === 0) vision.explored[index] = 1;
  }
}

/** Moves the circle of `id` to `cell` (a no-op when it hasn't changed). */
function place(vision: Vision, id: EntityId, cell: number, radius: number, seen: Set<EntityId>) {
  seen.add(id);
  const previous = vision.stamps.get(id);
  if (previous && previous.cell === cell && previous.radius === radius) return;
  // Stamp the new circle first, so cells in both never drop to 0 (no flicker in `version`).
  stamp(vision, cell, radius, 1);
  if (previous) stamp(vision, previous.cell, previous.radius, -1);
  vision.stamps.set(id, { cell, radius });
}

/** The footprint's center and corners: a building counts as seen when any of them is. */
function footprintPoints(building: BuildingInstance): Vec2[] {
  const { x, z, rotation } = building;
  const { w, d } = toPlacedFootprint(building).footprint;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const corner = (lx: number, lz: number) => ({
    x: x + cos * lx + sin * lz,
    z: z - sin * lx + cos * lz,
  });
  return [
    { x, z },
    corner(-w / 2, -d / 2),
    corner(w / 2, -d / 2),
    corner(-w / 2, d / 2),
    corner(w / 2, d / 2),
  ];
}

/** Whether any part of the building's footprint (center or a corner) is visible. */
export const buildingSeen = (vision: Vision, building: BuildingInstance) =>
  footprintPoints(building).some((p) => isVisible(vision, p.x, p.z));

/**
 * Brings the vision in line with `state`: the player's living units and buildings
 * (construction sites too) stamp their sight; units that died or moved to another cell
 * are re-stamped or removed; other players' buildings in sight are remembered as they
 * are now, and remembered ones whose spot is in sight but that no longer stand are
 * forgotten.
 */
export function updateVision(vision: Vision, state: GameState): void {
  const seen = new Set<EntityId>();
  for (const unit of state.units) {
    if (unit.ownerId !== vision.player || !isAlive(unit)) continue;
    place(vision, unit.id, cellAt(vision, unit.x, unit.z), UNITS[unit.type].sight, seen);
  }
  for (const building of state.buildings) {
    if (building.ownerId !== vision.player) continue;
    const cell = cellAt(vision, building.x, building.z);
    place(vision, building.id, cell, buildingSightOf(building.type), seen);
  }
  // A fallen hero's grave still shows its owner a little around it. (The hero's id is
  // free for the stamp: the dead hero gives no sight.)
  for (const grave of state.graves) {
    if (grave.ownerId !== vision.player) continue;
    place(vision, grave.id, cellAt(vision, grave.x, grave.z), HERO_RULES.graveSight, seen);
  }
  for (const reveal of state.reveals) {
    if (reveal.ownerId !== vision.player || state.tick > reveal.until) continue;
    place(vision, reveal.id, cellAt(vision, reveal.x, reveal.z), reveal.radius, seen);
  }
  if (vision.stamps.size > seen.size) {
    for (const [id, previous] of vision.stamps) {
      if (seen.has(id)) continue;
      stamp(vision, previous.cell, previous.radius, -1);
      vision.stamps.delete(id);
    }
  }

  const standing = new Set<EntityId>();
  for (const building of state.buildings) {
    if (building.ownerId === vision.player) continue;
    standing.add(building.id);
    if (buildingSeen(vision, building)) vision.lastSeen.set(building.id, building);
  }
  for (const [id, building] of vision.lastSeen) {
    if (!standing.has(id) && buildingSeen(vision, building)) vision.lastSeen.delete(id);
  }
}
