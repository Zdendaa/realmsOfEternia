import { BUILDINGS, depositOf, type BuildingId } from '@roe/game-data';
import {
  distanceToFootprint,
  entrancePoint,
  sampleFootprint,
  type PlacedFootprint,
  type PlayerId,
  type Vec2,
} from '@roe/shared';
import type { PlaceBuildingCommand } from '../commands/types.js';
import type { SimContext } from '../context/simContext.js';
import { cellIndexAt, isWalkable } from '../nav/navGrid.js';
import { checkPlacement, quarterTurnsToRadians } from '../rules/placement.js';
import { toPlacedFootprint, type GameState } from '../state/gameState.js';

export const SPOT_RULES = {
  /** Free room kept between its own buildings, so units and later paths fit. */
  gap: 2,
  /** How far in front of the entrance must be walkable. */
  entrance: 1.5,
  /** Other buildings keep this far outside a deposit's radius, leaving room for mines. */
  depositClearance: 4,
  /** Distance between two rings of candidates, and between candidates on a ring. */
  step: 2,
  /** How far from the starting point the search goes. */
  radius: 45,
  /** Spots a computer player looks at in one decision; the rest wait for its next ones. */
  perDecision: 120,
} as const;

export interface SpotOptions {
  /** Where the search starts and the entrance points (default: its Town Hall). */
  near?: Vec2;
  /** How far from `near` it goes. */
  radius?: number;
  /** A further condition on a spot, asked before the costlier placement rules. */
  accept?: (spot: PlaceBuildingCommand) => boolean;
}

/**
 * How a search that may stop early ended: a spot, nothing anywhere (`none`), or not done
 * yet, to go on from candidate `next`.
 */
export type SpotSearch =
  { kind: 'found'; spot: PlaceBuildingCommand } | { kind: 'none' } | { kind: 'more'; next: number };

/** The quarter turn that points a building's entrance (+Z) most directly at `target`. */
function facing(from: Vec2, target: Vec2): number {
  const dx = target.x - from.x;
  const dz = target.z - from.z;
  if (Math.abs(dx) > Math.abs(dz)) return dx > 0 ? 1 : 3;
  return dz >= 0 ? 0 : 2;
}

/** The points of the square ring `r` around `center`, clockwise from its north-west. */
function ring(center: Vec2, r: number, step: number): Vec2[] {
  if (r === 0) return [center];
  const points: Vec2[] = [];
  for (let d = -r; d < r; d += step) {
    points.push(
      { x: center.x + d, z: center.z - r },
      { x: center.x + r, z: center.z + d },
      { x: center.x - d, z: center.z + r },
      { x: center.x - r, z: center.z - d },
    );
  }
  return points;
}

/** From a footprint's center to its corners. */
const halfDiagonal = ({ footprint }: PlacedFootprint) => Math.hypot(footprint.w, footprint.d) / 2;

/**
 * Whether `area` keeps `SPOT_RULES.gap` to every one of `others` (sampled, since
 * footprints can be turned by any angle).
 */
function keepsGap(area: PlacedFootprint, others: readonly PlacedFootprint[]): boolean {
  const { gap } = SPOT_RULES;
  const grown = {
    ...area,
    footprint: { w: area.footprint.w + gap * 2, d: area.footprint.d + gap * 2 },
  };
  // Only those near enough to reach into it are looked at point by point.
  const reach = halfDiagonal(grown);
  const near = others.filter(
    (other) =>
      (other.x - area.x) ** 2 + (other.z - area.z) ** 2 <= (reach + halfDiagonal(other)) ** 2,
  );
  if (near.length === 0) return true;
  const samples = sampleFootprint(grown, 1);
  return near.every((other) => samples.every((p) => distanceToFootprint(other, p.x, p.z) > 0));
}

/**
 * Where the computer player could put `building`: the first spot on rings around `near`
 * (default: its Town Hall) that passes the same placement rules a human's does, keeps a
 * gap to its own buildings, leaves its entrance (turned toward `near`) walkable and
 * stays off the ore deposits. Mines are searched for on the deposits of their ore within
 * the radius, nearest first. Cost isn't checked.
 *
 * Looks at no more than `limit` candidates, starting at candidate `from`: a long search
 * is spread over several calls. The candidates come in the same order every time.
 */
export function searchBuildingSpot(
  ctx: SimContext,
  state: GameState,
  player: PlayerId,
  building: BuildingId,
  options: SpotOptions = {},
  from = 0,
  limit = Infinity,
): SpotSearch {
  const hall = state.buildings.find((b) => b.type === 'townHall' && b.ownerId === player);
  const near = options.near ?? hall;
  if (!near) return { kind: 'none' };
  const radius = options.radius ?? SPOT_RULES.radius;
  const center = { x: Math.round(near.x), z: Math.round(near.z) };
  const own = state.buildings.filter((b) => b.ownerId === player).map(toPlacedFootprint);
  const ore = depositOf(building);
  const definition = BUILDINGS[building];

  const tryAt = (at: Vec2): PlaceBuildingCommand | null => {
    const command: PlaceBuildingCommand = {
      type: 'placeBuilding',
      building,
      x: at.x,
      z: at.z,
      quarterTurns: facing(at, center),
    };
    const area: PlacedFootprint = {
      x: at.x,
      z: at.z,
      rotation: quarterTurnsToRadians(command.quarterTurns),
      footprint: definition.footprint,
    };
    if (!ore) {
      const clear = ctx.world.deposits.every(
        (d) => distanceToFootprint(area, d.x, d.z) > d.radius + SPOT_RULES.depositClearance,
      );
      if (!clear || !keepsGap(area, own)) return null;
    }
    if (options.accept && !options.accept(command)) return null;
    if (!checkPlacement(ctx.world, state, command, ctx.heights).ok) return null;
    // Serfs must get to it: its entrance is on the ground connected with the rest.
    const door = entrancePoint(area, SPOT_RULES.entrance);
    if (!isWalkable(ctx.nav, door.x, door.z, player)) return null;
    const regions = ctx.regions(player);
    return regions.of[cellIndexAt(ctx.nav, door.x, door.z)] === regions.main ? command : null;
  };

  let index = 0;
  /** The next candidate: its outcome when the search ends with it, else null. */
  const visit = (at: Vec2): SpotSearch | null => {
    const here = index++;
    if (here < from) return null;
    if (here >= from + limit) return { kind: 'more', next: here };
    const found = tryAt(at);
    return found && { kind: 'found', spot: found };
  };

  if (ore) {
    const distance = (p: Vec2) => (p.x - center.x) ** 2 + (p.z - center.z) ** 2;
    const deposits = ctx.world.deposits
      .filter((d) => d.kind === ore && distance(d) <= radius * radius)
      .sort((a, b) => distance(a) - distance(b));
    for (const deposit of deposits) {
      const middle = { x: Math.round(deposit.x), z: Math.round(deposit.z) };
      for (let r = 0; r <= deposit.radius; r++) {
        for (const at of ring(middle, r, 1)) {
          const end = visit(at);
          if (end) return end;
        }
      }
    }
    return { kind: 'none' };
  }
  for (let r = SPOT_RULES.step * 2; r <= radius; r += SPOT_RULES.step) {
    for (const at of ring(center, r, SPOT_RULES.step)) {
      const end = visit(at);
      if (end) return end;
    }
  }
  return { kind: 'none' };
}

/** The whole search at once: the spot, or null when nothing fits. */
export function findBuildingSpot(
  ctx: SimContext,
  state: GameState,
  player: PlayerId,
  building: BuildingId,
  options: SpotOptions = {},
): PlaceBuildingCommand | null {
  const search = searchBuildingSpot(ctx, state, player, building, options);
  return search.kind === 'found' ? search.spot : null;
}
