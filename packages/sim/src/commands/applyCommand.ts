import { BUILDINGS, UNITS } from '@roe/game-data';
import {
  entrancePoint,
  isInPlayableArea,
  SIMULATION_TICK_RATE,
  type EntityId,
  type PlayerId,
} from '@roe/shared';
import type { SimContext } from '../context/simContext.js';
import { checkPlacement, quarterTurnsToRadians, type PlacementIssue } from '../rules/placement.js';
import { toPlacedFootprint, type BuildingInstance, type GameState } from '../state/gameState.js';
import { spawnPoint } from '../state/spawn.js';
import { IDLE, type UnitInstance } from '../state/units.js';
import {
  assignToSlot,
  byDistanceTo,
  formationOffsets,
  freeSlots,
  moveTo,
  replaceUnits,
} from '../units/orders.js';
import type {
  AssignBuildersCommand,
  Command,
  MoveUnitsCommand,
  PlaceBuildingCommand,
  RecruitSerfCommand,
} from './types.js';

export type CommandIssue =
  | PlacementIssue
  /** The referenced building doesn't exist. */
  | 'noBuilding'
  /** The issuer doesn't own the building. */
  | 'notOwner'
  /** Serfs are recruited only at a Town Hall. */
  | 'notTownHall'
  /** The building is still under construction. */
  | 'underConstruction'
  /** The building is not a construction site. */
  | 'notConstructionSite'
  /** The issuer already has the maximum number of serfs. */
  | 'unitLimit'
  /** None of the addressed units exists and belongs to the issuer. */
  | 'noUnits';

export interface CommandCheck {
  ok: boolean;
  /** Every rule that failed, in check order. Empty when `ok`. */
  issues: CommandIssue[];
}

export type CommandResult =
  { ok: true; state: GameState } | { ok: false; state: GameState; check: CommandCheck };

const OK: CommandCheck = { ok: true, issues: [] };
const fail = (...issues: CommandIssue[]): CommandCheck => ({ ok: false, issues });

/** Units among `ids` that exist and belong to `issuer`, in state order. */
function ownUnits(state: GameState, issuer: PlayerId, ids: readonly EntityId[]): UnitInstance[] {
  const wanted = new Set(ids);
  return state.units.filter((u) => wanted.has(u.id) && u.ownerId === issuer);
}

const findBuilding = (state: GameState, id: EntityId) => state.buildings.find((b) => b.id === id);

function checkRecruit(state: GameState, issuer: PlayerId, command: RecruitSerfCommand) {
  const building = findBuilding(state, command.buildingId);
  if (!building) return fail('noBuilding');
  if (building.ownerId !== issuer) return fail('notOwner');
  if (building.type !== 'townHall') return fail('notTownHall');
  if (building.status !== 'complete') return fail('underConstruction');
  const serfs = state.units.filter((u) => u.type === 'serf' && u.ownerId === issuer).length;
  if (serfs >= UNITS.serf.maxPerPlayer) return fail('unitLimit');
  return OK;
}

function checkMove(ctx: SimContext, state: GameState, issuer: PlayerId, command: MoveUnitsCommand) {
  const issues: CommandIssue[] = [];
  if (ownUnits(state, issuer, command.unitIds).length === 0) issues.push('noUnits');
  if (!isInPlayableArea(ctx.world.map, command.x, command.z)) issues.push('outOfBounds');
  return issues.length === 0 ? OK : fail(...issues);
}

function checkAssign(state: GameState, issuer: PlayerId, command: AssignBuildersCommand) {
  const site = findBuilding(state, command.siteId);
  if (!site) return fail('noBuilding');
  if (site.ownerId !== issuer) return fail('notOwner');
  if (site.status !== 'construction') return fail('notConstructionSite');
  const serfs = ownUnits(state, issuer, command.unitIds).filter((u) => u.type === 'serf');
  return serfs.length === 0 ? fail('noUnits') : OK;
}

/** Checks whether `issuer` may execute `command` in `state`. `ctx` must be synced to `state`. */
export function validateCommand(
  ctx: SimContext,
  state: GameState,
  issuer: PlayerId,
  command: Command,
): CommandCheck {
  switch (command.type) {
    case 'placeBuilding':
      // Ownership and resources join the rules with the economy.
      return checkPlacement(ctx.world, state, command, ctx.heights);
    case 'recruitSerf':
      return checkRecruit(state, issuer, command);
    case 'moveUnits':
      return checkMove(ctx, state, issuer, command);
    case 'assignBuilders':
      return checkAssign(state, issuer, command);
  }
}

function placeBuilding(state: GameState, issuer: PlayerId, command: PlaceBuildingCommand) {
  const definition = BUILDINGS[command.building];
  const site: BuildingInstance = {
    id: state.nextEntityId,
    type: command.building,
    x: command.x,
    z: command.z,
    rotation: quarterTurnsToRadians(command.quarterTurns),
    ownerId: issuer,
    status: 'construction',
  };
  return {
    ...state,
    buildings: [...state.buildings, site],
    construction: {
      ...state.construction,
      [site.id]: { workDone: 0, workRequired: definition.buildTime * SIMULATION_TICK_RATE },
    },
    nextEntityId: state.nextEntityId + 1,
  };
}

function recruitSerf(state: GameState, issuer: PlayerId, command: RecruitSerfCommand): GameState {
  const townHall = findBuilding(state, command.buildingId) as BuildingInstance;
  const at = spawnPoint(townHall, state.nextEntityId);
  const serf: UnitInstance = {
    id: state.nextEntityId,
    type: 'serf',
    ownerId: issuer,
    x: at.x,
    z: at.z,
    task: IDLE,
    movement: null,
    activity: 'idle',
  };
  return { ...state, units: [...state.units, serf], nextEntityId: state.nextEntityId + 1 };
}

/** Sends `units` to spread-out points around (x, z); the nearest unit takes the center. */
function sendGroup(units: readonly UnitInstance[], x: number, z: number) {
  const target = { x, z };
  const offsets = formationOffsets(units.length);
  const changed = new Map<EntityId, UnitInstance>();
  byDistanceTo(units, target).forEach((unit, i) => {
    const offset = offsets[i] ?? { x: 0, z: 0 };
    const goal = { x: x + offset.x, z: z + offset.z };
    changed.set(unit.id, { ...unit, task: { kind: 'move', ...goal }, movement: moveTo(goal) });
  });
  return changed;
}

function moveUnits(state: GameState, issuer: PlayerId, command: MoveUnitsCommand): GameState {
  const changed = sendGroup(ownUnits(state, issuer, command.unitIds), command.x, command.z);
  return { ...state, units: replaceUnits(state.units, changed) };
}

/**
 * The serfs nearest to the site take its free work slots. Serfs beyond `maxBuilders`
 * walk to the site's entrance and wait there, so a big group doesn't stay behind.
 */
function assignBuilders(
  state: GameState,
  issuer: PlayerId,
  command: AssignBuildersCommand,
): GameState {
  const site = findBuilding(state, command.siteId) as BuildingInstance;
  const serfs = ownUnits(state, issuer, command.unitIds).filter((u) => u.type === 'serf');
  // Selected serfs already on this site give up their slots first, so they can be re-sorted.
  const selected = new Set(serfs.map((u) => u.id));
  const others = state.units.filter((u) => !selected.has(u.id));
  const slots = freeSlots(site, others);

  const changed = new Map<EntityId, UnitInstance>();
  const ordered = byDistanceTo(serfs, site);
  ordered.slice(0, slots.length).forEach((serf, i) => {
    changed.set(serf.id, assignToSlot(serf, site, slots[i] as number, true));
  });
  const extra = ordered.slice(slots.length);
  if (extra.length > 0) {
    const door = entrancePoint(toPlacedFootprint(site), 2.5);
    for (const [id, unit] of sendGroup(extra, door.x, door.z)) changed.set(id, unit);
  }
  return { ...state, units: replaceUnits(state.units, changed) };
}

/**
 * Validates and executes a command. Pure apart from reading the synced context: returns
 * a new state and never mutates the given one. A rejected command returns the unchanged
 * state (same reference).
 */
export function applyCommand(
  ctx: SimContext,
  state: GameState,
  issuer: PlayerId,
  command: Command,
): CommandResult {
  const check = validateCommand(ctx, state, issuer, command);
  if (!check.ok) return { ok: false, state, check };

  switch (command.type) {
    case 'placeBuilding':
      return { ok: true, state: placeBuilding(state, issuer, command) };
    case 'recruitSerf':
      return { ok: true, state: recruitSerf(state, issuer, command) };
    case 'moveUnits':
      return { ok: true, state: moveUnits(state, issuer, command) };
    case 'assignBuilders':
      return { ok: true, state: assignBuilders(state, issuer, command) };
  }
}
