import { BUILDINGS, GATHER_RULES, isBuildingId, trainsOf, UNITS } from '@roe/game-data';
import { areEnemies } from '../combat/hostility.js';
import { sendWave } from '../combat/waves.js';
import {
  entrancePoint,
  isInPlayableArea,
  SIMULATION_TICK_RATE,
  type EntityId,
  type PlayerId,
} from '@roe/shared';
import type { SimContext } from '../context/simContext.js';
import { hasFreeHousing, populationOf } from '../economy/population.js';
import { canAfford, pay, refund, stockOf, withStock } from '../economy/stock.js';
import { dequeue, enqueue, TRAINING_QUEUE_LIMIT, withoutKey } from '../training/training.js';
import { checkPlacement, quarterTurnsToRadians, type PlacementIssue } from '../rules/placement.js';
import { toPlacedFootprint, type BuildingInstance, type GameState } from '../state/gameState.js';
import { nodeById, nodesNear, remainingAmount } from '../state/resourceNodes.js';
import { spawnPoint } from '../state/spawn.js';
import { createUnit, IDLE, isAlive, type UnitInstance } from '../state/units.js';
import { startGathering } from '../units/gathering.js';
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
  AttackCommand,
  AttackMoveCommand,
  Command,
  DebugSpawnCommand,
  GatherCommand,
  MoveUnitsCommand,
  PlaceBuildingCommand,
  RecruitSerfCommand,
  StopCommand,
  CancelTrainingCommand,
  TrainUnitCommand,
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
  /** Every place in the issuer's houses and Town Hall is taken. */
  | 'noHousing'
  /** None of the addressed units exists and belongs to the issuer. */
  | 'noUnits'
  /** The issuer's stock can't pay the cost. */
  | 'notEnoughResources'
  /** No harvestable tree or rock with anything left at that id. */
  | 'noResource'
  /** The attack target (a unit or a building) doesn't exist, or the unit is already dead. */
  | 'noTarget'
  /** The attack target isn't an enemy of the issuer. */
  | 'notEnemy'
  /** A development command sent to a simulation that doesn't accept them. */
  | 'devOnly'
  /** The building doesn't train that unit. */
  | 'cannotTrain'
  /** The building's training queue is full. */
  | 'queueFull'
  /** Nothing queued at that place. */
  | 'notQueued'
  /** The map has no scripted waves. */
  | 'noWave';

export interface CommandCheck {
  ok: boolean;
  /** Every rule that failed, in check order. Empty when `ok`. */
  issues: CommandIssue[];
}

export type CommandResult =
  { ok: true; state: GameState } | { ok: false; state: GameState; check: CommandCheck };

const OK: CommandCheck = { ok: true, issues: [] };
const fail = (...issues: CommandIssue[]): CommandCheck => ({ ok: false, issues });

/**
 * Units among `ids` that exist, are alive, belong to `issuer` and take orders (workers
 * don't), in state order.
 */
function ownUnits(state: GameState, issuer: PlayerId, ids: readonly EntityId[]): UnitInstance[] {
  const wanted = new Set(ids);
  return state.units.filter(
    (u) => wanted.has(u.id) && u.ownerId === issuer && isAlive(u) && UNITS[u.type].controllable,
  );
}

/** A unit's combat state with no target, strike or leash (after a new order). */
const freshCombat = (unit: UnitInstance): UnitInstance['combat'] =>
  unit.combat && { ...unit.combat, targetId: null, strikeAt: null, anchor: null };

const findBuilding = (state: GameState, id: EntityId) => state.buildings.find((b) => b.id === id);

function checkRecruit(state: GameState, issuer: PlayerId, command: RecruitSerfCommand) {
  const building = findBuilding(state, command.buildingId);
  if (!building) return fail('noBuilding');
  if (building.ownerId !== issuer) return fail('notOwner');
  if (building.type !== 'townHall') return fail('notTownHall');
  if (building.status !== 'complete') return fail('underConstruction');
  const serfs = state.units.filter((u) => u.type === 'serf' && u.ownerId === issuer).length;
  if (serfs >= UNITS.serf.maxPerPlayer) return fail('unitLimit');
  const issues: CommandIssue[] = [];
  if (!hasFreeHousing(populationOf(state, issuer))) issues.push('noHousing');
  if (!canAfford(stockOf(state, issuer), UNITS.serf.cost)) issues.push('notEnoughResources');
  return issues.length === 0 ? OK : fail(...issues);
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

function checkGather(ctx: SimContext, state: GameState, issuer: PlayerId, command: GatherCommand) {
  if (remainingAmount(ctx.world, state.resourceNodes, command.nodeId) <= 0) {
    return fail('noResource');
  }
  const serfs = ownUnits(state, issuer, command.unitIds).filter((u) => u.type === 'serf');
  return serfs.length === 0 ? fail('noUnits') : OK;
}

function checkAttack(state: GameState, issuer: PlayerId, command: AttackCommand) {
  // A living unit, or a building (complete or a construction site).
  const unit = state.units.find((u) => u.id === command.targetId);
  const target = unit && isAlive(unit) ? unit : findBuilding(state, command.targetId);
  if (!target) return fail('noTarget');
  if (!areEnemies(issuer, target.ownerId)) return fail('notEnemy');
  const fighters = ownUnits(state, issuer, command.unitIds).filter((u) => u.combat);
  return fighters.length === 0 ? fail('noUnits') : OK;
}

function checkAttackMove(
  ctx: SimContext,
  state: GameState,
  issuer: PlayerId,
  command: AttackMoveCommand,
) {
  return checkMove(ctx, state, issuer, { ...command, type: 'moveUnits' });
}

function checkStop(state: GameState, issuer: PlayerId, command: StopCommand) {
  return ownUnits(state, issuer, command.unitIds).length === 0 ? fail('noUnits') : OK;
}

/** The issuer's own, complete building that trains: the common checks of both training commands. */
function checkTrainingBuilding(state: GameState, issuer: PlayerId, buildingId: EntityId) {
  const building = findBuilding(state, buildingId);
  if (!building) return fail('noBuilding');
  if (building.ownerId !== issuer) return fail('notOwner');
  if (building.status !== 'complete') return fail('underConstruction');
  return OK;
}

function checkTrain(state: GameState, issuer: PlayerId, command: TrainUnitCommand) {
  const base = checkTrainingBuilding(state, issuer, command.buildingId);
  if (!base.ok) return base;
  const building = findBuilding(state, command.buildingId) as BuildingInstance;
  if (!trainsOf(building.type).includes(command.unit)) return fail('cannotTrain');
  const issues: CommandIssue[] = [];
  const queued = state.training[building.id]?.queue.length ?? 0;
  if (queued >= TRAINING_QUEUE_LIMIT) issues.push('queueFull');
  if (!canAfford(stockOf(state, issuer), UNITS[command.unit].cost)) {
    issues.push('notEnoughResources');
  }
  return issues.length === 0 ? OK : fail(...issues);
}

function checkCancelTraining(state: GameState, issuer: PlayerId, command: CancelTrainingCommand) {
  const base = checkTrainingBuilding(state, issuer, command.buildingId);
  if (!base.ok) return base;
  const queued = state.training[command.buildingId]?.queue.length ?? 0;
  return command.index < queued ? OK : fail('notQueued');
}

function checkDebugSpawn(ctx: SimContext, command: DebugSpawnCommand) {
  if (!ctx.dev) return fail('devOnly');
  return isInPlayableArea(ctx.world.map, command.x, command.z) ? OK : fail('outOfBounds');
}

/** Placement rules for the spot, then the cost (an unknown building has no cost to check). */
function checkPlace(
  ctx: SimContext,
  state: GameState,
  issuer: PlayerId,
  command: PlaceBuildingCommand,
): CommandCheck {
  const issues: CommandIssue[] = [...checkPlacement(ctx.world, state, command, ctx.heights).issues];
  const known = isBuildingId(command.building);
  if (known && !canAfford(stockOf(state, issuer), BUILDINGS[command.building].cost)) {
    issues.push('notEnoughResources');
  }
  return issues.length === 0 ? OK : fail(...issues);
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
      return checkPlace(ctx, state, issuer, command);
    case 'recruitSerf':
      return checkRecruit(state, issuer, command);
    case 'moveUnits':
      return checkMove(ctx, state, issuer, command);
    case 'assignBuilders':
      return checkAssign(state, issuer, command);
    case 'gather':
      return checkGather(ctx, state, issuer, command);
    case 'attack':
      return checkAttack(state, issuer, command);
    case 'attackMove':
      return checkAttackMove(ctx, state, issuer, command);
    case 'stop':
      return checkStop(state, issuer, command);
    case 'trainUnit':
      return checkTrain(state, issuer, command);
    case 'cancelTraining':
      return checkCancelTraining(state, issuer, command);
    case 'debugSpawn':
      return checkDebugSpawn(ctx, command);
    case 'debugWave':
      if (!ctx.dev) return fail('devOnly');
      return (ctx.world.map.waves?.length ?? 0) > 0 ? OK : fail('noWave');
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
  const paid = withStock(state, issuer, pay(stockOf(state, issuer), definition.cost));
  return {
    ...paid,
    buildings: [...state.buildings, site],
    construction: {
      ...state.construction,
      [site.id]: {
        workDone: 0,
        workRequired: definition.buildTime * SIMULATION_TICK_RATE,
        delivered: {},
      },
    },
    nextEntityId: state.nextEntityId + 1,
  };
}

function recruitSerf(state: GameState, issuer: PlayerId, command: RecruitSerfCommand): GameState {
  const townHall = findBuilding(state, command.buildingId) as BuildingInstance;
  const at = spawnPoint(townHall, state.nextEntityId);
  const serf = createUnit(state.nextEntityId, 'serf', issuer, at);
  const paid = withStock(state, issuer, pay(stockOf(state, issuer), UNITS.serf.cost));
  return { ...paid, units: [...state.units, serf], nextEntityId: state.nextEntityId + 1 };
}

/**
 * Sends `units` to spread-out points around (x, z); the nearest unit takes the center.
 * With `fight`, units that fight attack-move there (the others just walk). Any target
 * or leash from before is dropped.
 */
function sendGroup(units: readonly UnitInstance[], x: number, z: number, fight = false) {
  const target = { x, z };
  const offsets = formationOffsets(units.length);
  const changed = new Map<EntityId, UnitInstance>();
  byDistanceTo(units, target).forEach((unit, i) => {
    const offset = offsets[i] ?? { x: 0, z: 0 };
    const goal = { x: x + offset.x, z: z + offset.z };
    const kind = fight && unit.combat ? 'attackMove' : 'move';
    changed.set(unit.id, {
      ...unit,
      task: { kind, ...goal },
      movement: moveTo(goal),
      combat: freshCombat(unit),
    });
  });
  return changed;
}

function moveUnits(state: GameState, issuer: PlayerId, command: MoveUnitsCommand): GameState {
  const changed = sendGroup(ownUnits(state, issuer, command.unitIds), command.x, command.z);
  return { ...state, units: replaceUnits(state.units, changed) };
}

function attack(state: GameState, issuer: PlayerId, command: AttackCommand): GameState {
  const changed = new Map<EntityId, UnitInstance>();
  for (const unit of ownUnits(state, issuer, command.unitIds)) {
    const combat = freshCombat(unit);
    if (!combat) continue;
    changed.set(unit.id, {
      ...unit,
      task: { kind: 'attack', targetId: command.targetId },
      movement: null,
      combat: { ...combat, targetId: command.targetId },
    });
  }
  return { ...state, units: replaceUnits(state.units, changed) };
}

function attackMove(state: GameState, issuer: PlayerId, command: AttackMoveCommand): GameState {
  const changed = sendGroup(ownUnits(state, issuer, command.unitIds), command.x, command.z, true);
  return { ...state, units: replaceUnits(state.units, changed) };
}

/** Stopped units stand where they are; cargo stays in their hands. */
function stop(state: GameState, issuer: PlayerId, command: StopCommand): GameState {
  const changed = new Map<EntityId, UnitInstance>();
  for (const unit of ownUnits(state, issuer, command.unitIds)) {
    changed.set(unit.id, { ...unit, task: IDLE, movement: null, combat: freshCombat(unit) });
  }
  return { ...state, units: replaceUnits(state.units, changed) };
}

function trainUnit(state: GameState, issuer: PlayerId, command: TrainUnitCommand): GameState {
  const paid = withStock(state, issuer, pay(stockOf(state, issuer), UNITS[command.unit].cost));
  const queue = enqueue(state.training[command.buildingId], command.unit, state.tick);
  return { ...paid, training: { ...state.training, [command.buildingId]: queue } };
}

function cancelTraining(
  state: GameState,
  issuer: PlayerId,
  command: CancelTrainingCommand,
): GameState {
  const current = state.training[command.buildingId];
  const kind = current?.queue[command.index];
  if (!current || kind === undefined) return state;
  const refunded = withStock(state, issuer, refund(stockOf(state, issuer), UNITS[kind].cost));
  const rest = dequeue(current, command.index, state.tick);
  const training = rest
    ? { ...state.training, [command.buildingId]: rest }
    : withoutKey(state.training, command.buildingId);
  return { ...refunded, training };
}

/**
 * Dev wave: the map's next wave comes now (cycling through them), counted as sent so it
 * doesn't come again on its own.
 */
function debugWave(ctx: SimContext, state: GameState): GameState {
  const waves = ctx.world.map.waves ?? [];
  const wave = waves[state.wavesSent % waves.length];
  if (!wave) return state;
  const units = [...state.units];
  const nextEntityId = sendWave(wave, state.buildings, units, state.nextEntityId);
  return {
    ...state,
    units,
    nextEntityId,
    wavesSent: state.wavesSent + 1,
    lastWaveAt: state.tick,
  };
}

/** Dev spawn: `count` fresh units spread around the point, appended in id order. */
function debugSpawn(state: GameState, issuer: PlayerId, command: DebugSpawnCommand): GameState {
  const owner = command.owner === undefined ? issuer : command.owner;
  const spawned = formationOffsets(command.count).map((offset, i) =>
    createUnit(state.nextEntityId + i, command.unit, owner, {
      x: command.x + offset.x,
      z: command.z + offset.z,
    }),
  );
  return {
    ...state,
    units: [...state.units, ...spawned],
    nextEntityId: state.nextEntityId + spawned.length,
  };
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
 * The serf nearest to the node takes it; the others spread over the nearest nodes of
 * the same kind around it (round robin when there are more serfs than nodes).
 */
function gather(ctx: SimContext, state: GameState, issuer: PlayerId, command: GatherCommand) {
  const node = nodeById(ctx.world, command.nodeId);
  if (!node) return state;
  const serfs = byDistanceTo(
    ownUnits(state, issuer, command.unitIds).filter((u) => u.type === 'serf'),
    node,
  );
  const nearby = nodesNear(
    ctx.world,
    state.resourceNodes,
    node.kind,
    node,
    GATHER_RULES.nextNodeRadius / 2,
  ).filter((n) => n.id !== node.id);
  const targets = [node, ...nearby].slice(0, serfs.length);
  const changed = new Map<EntityId, UnitInstance>();
  serfs.forEach((serf, i) => {
    const target = targets[i % targets.length] ?? node;
    changed.set(serf.id, { ...serf, ...startGathering(serf, target) });
  });
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
    case 'gather':
      return { ok: true, state: gather(ctx, state, issuer, command) };
    case 'attack':
      return { ok: true, state: attack(state, issuer, command) };
    case 'attackMove':
      return { ok: true, state: attackMove(state, issuer, command) };
    case 'stop':
      return { ok: true, state: stop(state, issuer, command) };
    case 'trainUnit':
      return { ok: true, state: trainUnit(state, issuer, command) };
    case 'cancelTraining':
      return { ok: true, state: cancelTraining(state, issuer, command) };
    case 'debugSpawn':
      return { ok: true, state: debugSpawn(state, issuer, command) };
    case 'debugWave':
      return { ok: true, state: debugWave(ctx, state) };
  }
}
