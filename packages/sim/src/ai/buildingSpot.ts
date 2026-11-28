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
import { isWalkable } from '../nav/navGrid.js';
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
} as const;

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
  const samples = sampleFootprint(grown, 1);
  return others.every((other) => samples.every((p) => distanceToFootprint(other, p.x, p.z) > 0));
}

/**
 * Where the computer player could put `building`: the first spot on rings around `near`
 * (default: its Town Hall) that passes the same placement rules a human's does, keeps a
 * gap to its own buildings, leaves its entrance (turned toward `near`) walkable and
 * stays off the ore deposits. Mines are searched for on the deposits of their ore within
 * the radius, nearest first. Cost isn't checked. Null when nothing fits.
 */
export function findBuildingSpot(
  ctx: SimContext,
  state: GameState,
  player: PlayerId,
  building: BuildingId,
  options: { near?: Vec2; radius?: number } = {},
): PlaceBuildingCommand | null {
  const hall = state.buildings.find((b) => b.type === 'townHall' && b.ownerId === player);
  const near = options.near ?? hall;
  if (!near) return null;
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
    if (!checkPlacement(ctx.world, state, command, ctx.heights).ok) return null;
    const door = entrancePoint(area, SPOT_RULES.entrance);
    return isWalkable(ctx.nav, door.x, door.z, player) ? command : null;
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
          const found = tryAt(at);
          if (found) return found;
        }
      }
    }
    return null;
  }
  for (let r = SPOT_RULES.step * 2; r <= radius; r += SPOT_RULES.step) {
    for (const at of ring(center, r, SPOT_RULES.step)) {
      const found = tryAt(at);
      if (found) return found;
    }
  }
  return null;
}
