import { isBuildingId, type BuildingId } from '@roe/game-data';
import type { PlayerId } from '@roe/shared';

/**
 * Commands are what a client sends. They never contain the issuing player: the server
 * takes the player from the network session (`IssuedCommand`), so a client can't act
 * on behalf of someone else.
 */
export interface PlaceBuildingCommand {
  type: 'placeBuilding';
  building: BuildingId;
  /** Building center, on the 1-unit grid. */
  x: number;
  z: number;
  /** Rotation in 90° steps (0–3). Integers keep validation exact. */
  quarterTurns: number;
}

export type Command = PlaceBuildingCommand;

/** A command together with the player who issued it, attached by the receiver. */
export interface IssuedCommand {
  issuer: PlayerId;
  command: Command;
}

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Turns untrusted input (a network message) into a well-formed command, or null.
 * Only known fields are copied: anything else in the payload, including a `playerId`
 * or `issuer`, is dropped. Game rules are checked later by `validateCommand`.
 */
export function parseCommand(input: unknown): Command | null {
  if (typeof input !== 'object' || input === null) return null;
  const data = input as Record<string, unknown>;
  if (data.type === 'placeBuilding') {
    const { building, x, z, quarterTurns } = data;
    if (!isBuildingId(building) || !isFiniteNumber(x) || !isFiniteNumber(z)) return null;
    if (!isFiniteNumber(quarterTurns)) return null;
    return { type: 'placeBuilding', building, x, z, quarterTurns };
  }
  return null;
}
