import { isBuildingId, isUnitKind, type BuildingId, type UnitKind } from '@roe/game-data';
import type { EntityId, PlayerId } from '@roe/shared';

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

/** Recruit one serf at a Town Hall. */
export interface RecruitSerfCommand {
  type: 'recruitSerf';
  buildingId: EntityId;
}

/** Walk the given units to a point (they spread out around it). */
export interface MoveUnitsCommand {
  type: 'moveUnits';
  unitIds: EntityId[];
  x: number;
  z: number;
}

/** Send the given serfs to build a construction site. */
export interface AssignBuildersCommand {
  type: 'assignBuilders';
  unitIds: EntityId[];
  siteId: EntityId;
}

/**
 * Send the given serfs to harvest a tree or rock (decoration id `nodeId`); a group
 * spreads over nearby nodes of the same kind.
 */
export interface GatherCommand {
  type: 'gather';
  unitIds: EntityId[];
  nodeId: number;
}

/** Send the given fighting units after one enemy unit or building, until it falls. */
export interface AttackCommand {
  type: 'attack';
  unitIds: EntityId[];
  targetId: EntityId;
}

/**
 * Walk the given units to a point (spread out like a move), fighting every enemy they
 * meet on the way. Units that don't fight just walk.
 */
export interface AttackMoveCommand {
  type: 'attackMove';
  unitIds: EntityId[];
  x: number;
  z: number;
}

/** Queue one unit at a training building (barracks, archery range); paid now. */
export interface TrainUnitCommand {
  type: 'trainUnit';
  buildingId: EntityId;
  unit: UnitKind;
}

/** Remove the unit at `index` from a building's training queue; its cost is refunded. */
export interface CancelTrainingCommand {
  type: 'cancelTraining';
  buildingId: EntityId;
  index: number;
}

/** The given units drop what they are doing (orders, targets, routes) and stand. */
export interface StopCommand {
  type: 'stop';
  unitIds: EntityId[];
}

/**
 * Development only: spawn `count` units of `unit` around (x, z) for `owner` (null:
 * neutral; absent: the issuer). Accepted only by a simulation context created with
 * `dev: true`; the server never creates one.
 */
export interface DebugSpawnCommand {
  type: 'debugSpawn';
  unit: UnitKind;
  count: number;
  x: number;
  z: number;
  owner?: PlayerId | null;
}

/** Development only: the next scripted wave of the map comes now (then the following one). */
export interface DebugWaveCommand {
  type: 'debugWave';
}

export type Command =
  | PlaceBuildingCommand
  | RecruitSerfCommand
  | MoveUnitsCommand
  | AssignBuildersCommand
  | GatherCommand
  | AttackCommand
  | AttackMoveCommand
  | StopCommand
  | TrainUnitCommand
  | CancelTrainingCommand
  | DebugSpawnCommand
  | DebugWaveCommand;

/** A command together with the player who issued it, attached by the receiver. */
export interface IssuedCommand {
  issuer: PlayerId;
  command: Command;
}

/** Most units one command may address. */
export const MAX_COMMAND_UNITS = 256;

/** Most units one dev spawn may create. */
export const MAX_DEBUG_SPAWN = 100;

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isEntityId = (v: unknown): v is EntityId =>
  typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
/** Decoration ids are indices: 0 is valid. */
const isNodeId = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

/** A non-empty list of distinct entity ids, or null. */
function parseUnitIds(value: unknown): EntityId[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_COMMAND_UNITS) return null;
  if (!value.every(isEntityId)) return null;
  return [...new Set(value)];
}

/**
 * Turns untrusted input (a network message) into a well-formed command, or null.
 * Only known fields are copied: anything else in the payload, including a `playerId`
 * or `issuer`, is dropped. Game rules are checked later by `validateCommand`.
 */
export function parseCommand(input: unknown): Command | null {
  if (typeof input !== 'object' || input === null) return null;
  const data = input as Record<string, unknown>;
  switch (data.type) {
    case 'placeBuilding': {
      const { building, x, z, quarterTurns } = data;
      if (!isBuildingId(building) || !isFiniteNumber(x) || !isFiniteNumber(z)) return null;
      if (!isFiniteNumber(quarterTurns)) return null;
      return { type: 'placeBuilding', building, x, z, quarterTurns };
    }
    case 'recruitSerf':
      return isEntityId(data.buildingId)
        ? { type: 'recruitSerf', buildingId: data.buildingId }
        : null;
    case 'moveUnits': {
      const unitIds = parseUnitIds(data.unitIds);
      const { x, z } = data;
      if (!unitIds || !isFiniteNumber(x) || !isFiniteNumber(z)) return null;
      return { type: 'moveUnits', unitIds, x, z };
    }
    case 'assignBuilders': {
      const unitIds = parseUnitIds(data.unitIds);
      if (!unitIds || !isEntityId(data.siteId)) return null;
      return { type: 'assignBuilders', unitIds, siteId: data.siteId };
    }
    case 'gather': {
      const unitIds = parseUnitIds(data.unitIds);
      if (!unitIds || !isNodeId(data.nodeId)) return null;
      return { type: 'gather', unitIds, nodeId: data.nodeId };
    }
    case 'attack': {
      const unitIds = parseUnitIds(data.unitIds);
      if (!unitIds || !isEntityId(data.targetId)) return null;
      return { type: 'attack', unitIds, targetId: data.targetId };
    }
    case 'attackMove': {
      const unitIds = parseUnitIds(data.unitIds);
      const { x, z } = data;
      if (!unitIds || !isFiniteNumber(x) || !isFiniteNumber(z)) return null;
      return { type: 'attackMove', unitIds, x, z };
    }
    case 'stop': {
      const unitIds = parseUnitIds(data.unitIds);
      return unitIds ? { type: 'stop', unitIds } : null;
    }
    case 'trainUnit': {
      const { buildingId, unit } = data;
      if (!isEntityId(buildingId) || !isUnitKind(unit)) return null;
      return { type: 'trainUnit', buildingId, unit };
    }
    case 'cancelTraining': {
      const { buildingId, index } = data;
      if (!isEntityId(buildingId) || !isNodeId(index)) return null;
      return { type: 'cancelTraining', buildingId, index };
    }
    case 'debugWave':
      return { type: 'debugWave' };
    case 'debugSpawn': {
      const { unit, count, x, z, owner } = data;
      if (!isUnitKind(unit) || !isFiniteNumber(x) || !isFiniteNumber(z)) return null;
      if (!Number.isSafeInteger(count) || (count as number) < 1) return null;
      if ((count as number) > MAX_DEBUG_SPAWN) return null;
      if (owner !== undefined && owner !== null && typeof owner !== 'string') return null;
      const command: DebugSpawnCommand = { type: 'debugSpawn', unit, count: count as number, x, z };
      if (owner !== undefined) command.owner = owner;
      return command;
    }
    default:
      return null;
  }
}
