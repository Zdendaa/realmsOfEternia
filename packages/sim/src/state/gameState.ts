import {
  BUILDINGS,
  isBuildingId,
  isWall,
  productionOf,
  STARTING_RESOURCES,
  type BuildingId,
  type ResourceAmounts,
  type ResourceId,
} from '@roe/game-data';
import type { EntityId, Footprint, PlacedFootprint, PlayerId } from '@roe/shared';
import type { Projectile } from '../combat/projectiles.js';
import type { TowerCooldowns } from '../combat/towers.js';
import type { TowerUpgrades } from '../combat/upgrades.js';
import type { TrainingQueue } from '../training/training.js';
import type { Outcome, PlayerStats } from '../rules/outcome.js';
import type { SimWorld } from '../world/createWorld.js';
import { RIPE_FIELD, type FieldState } from './fields.js';
import { spawnHero } from '../heroes/heroes.js';
import { createUnit, type UnitInstance } from './units.js';
import { hireWorkers } from '../units/workers.js';
import { spawnPoint } from './spawn.js';
import { spawnCamps } from '../combat/camps.js';

export type BuildingStatus = 'construction' | 'complete';

export interface BuildingInstance {
  id: EntityId;
  type: BuildingId;
  x: number;
  z: number;
  /** Y rotation in radians. */
  rotation: number;
  /** Owner; null for neutral buildings. */
  ownerId: PlayerId | null;
  /** Player buildings start as construction sites; the starting settlement is complete. */
  status: BuildingStatus;
}

/**
 * Progress of one construction site, in serf-ticks: each tick every working serf adds 1.
 * Integers keep progress exact on every machine.
 */
export interface ConstructionProgress {
  workDone: number;
  workRequired: number;
  /**
   * Materials delivered so far (the cost was paid at placement; builders carry it over
   * one unit per trip). Work can't get ahead of the delivered share of the cost.
   */
  delivered: Readonly<Partial<Record<ResourceId, number>>>;
}

/**
 * Where a building was destroyed. Ruins don't block anything; the ground stays
 * flattened under them (so terrain heights don't jump), and the client draws the rubble.
 */
export interface Ruin {
  /** The destroyed building's id. */
  id: EntityId;
  type: BuildingId;
  x: number;
  z: number;
  rotation: number;
  ownerId: PlayerId | null;
  /** Tick it was destroyed on. */
  destroyedAt: number;
}

/** Authoritative simulation state. Plain data: serializable, never mutated in place. */
export interface GameState {
  /** Number of simulation ticks run so far. */
  readonly tick: number;
  /** Changes only when buildings are placed or finished, never for progress. */
  readonly buildings: readonly BuildingInstance[];
  /** Construction progress by site (building) id. Changes every tick while serfs build. */
  readonly construction: Readonly<Record<EntityId, ConstructionProgress>>;
  readonly units: readonly UnitInstance[];
  /**
   * Each player's resources (whole numbers). Goods count once delivered to a storage;
   * construction costs are paid from here when a site is placed.
   */
  readonly stocks: Readonly<Record<PlayerId, Readonly<ResourceAmounts>>>;
  /**
   * Remaining amounts of trees and rocks that have been harvested, by decoration id.
   * Untouched nodes are absent (full); 0 means depleted (gone from the world).
   * Changes only when a unit of a resource is taken.
   */
  readonly resourceNodes: Readonly<Record<number, number>>;
  /**
   * Fields by building id (sowing, growing, harvesting). A field without a record is
   * fresh (bare, to be sown). Changes when a plot is sown or harvested.
   */
  readonly fields: Readonly<Record<EntityId, FieldState>>;
  /** Arrows in flight. Changes when one is released or lands. */
  readonly projectiles: readonly Projectile[];
  /** When each tower may shoot again. Changes when one shoots or falls. */
  readonly towerCooldowns: TowerCooldowns;
  /** Towers being upgraded, by building id. Changes when one starts, ends or falls. */
  readonly upgrades: TowerUpgrades;
  /**
   * Training queues by building id (barracks, archery range); absent = nothing queued.
   * Changes when a unit is queued, cancelled or finished.
   */
  readonly training: Readonly<Record<EntityId, TrainingQueue>>;
  /**
   * Damage taken by buildings (and construction sites), by building id; absent = unhurt.
   * A building falls when its damage reaches its health (`buildingMaxHealth`).
   */
  readonly buildingDamage: Readonly<Record<EntityId, number>>;
  /** Destroyed buildings, oldest first. Changes when a building falls. */
  readonly ruins: readonly Ruin[];
  /** How many of the map's scripted waves have been sent (they go in time order). */
  readonly wavesSent: number;
  /** Tick the latest wave set out on, or null before the first. */
  readonly lastWaveAt: number | null;
  /** How the game ended, by player; absent while it goes on. Never changes once set. */
  readonly outcome: Readonly<Record<PlayerId, Outcome>>;
  /** Per-player numbers for the end screen (soldiers trained, enemies killed, buildings lost). */
  readonly stats: Readonly<Record<PlayerId, PlayerStats>>;
  readonly nextEntityId: EntityId;
}

export interface InitialStateOptions {
  /**
   * Owner of the starting settlement and its serfs. The client gives it to the local
   * player; the server keeps it neutral until matches have start positions.
   */
  owner?: PlayerId | null;
  /**
   * Further players who start with a stock (the owner always gets one). Matches with
   * start positions will list every player here.
   */
  players?: readonly PlayerId[];
  /** Starting stock of every listed player; defaults to `STARTING_RESOURCES`. */
  resources?: Readonly<ResourceAmounts>;
}

/**
 * The starting settlement becomes the first building instances (ids 1..n), followed by
 * the starting serfs next to the first Town Hall. Its fields start ripe.
 */
export function createInitialState(world: SimWorld, options: InitialStateOptions = {}): GameState {
  const owner = options.owner ?? null;
  const buildings = world.buildings.map((b, i): BuildingInstance => {
    const type = b.definition.id;
    if (!isBuildingId(type)) throw new Error(`Unknown building type "${type}"`);
    return {
      id: i + 1,
      type,
      x: b.x,
      z: b.z,
      rotation: b.rotation,
      ownerId: owner,
      status: 'complete',
    };
  });

  let nextEntityId = buildings.length + 1;
  const townHall = buildings.find((b) => b.type === 'townHall');
  const units: UnitInstance[] = [];
  if (townHall) {
    for (let i = 0; i < world.startingSerfs; i++) {
      units.push(createUnit(nextEntityId++, 'serf', owner, spawnPoint(townHall, i)));
    }
  }
  // Production buildings of an owned starting settlement come with their workers
  // (housing permitting, like any other).
  nextEntityId = hireWorkers(buildings, units, nextEntityId);
  // Monster camps guard their spots from the start.
  const camps = spawnCamps(world.map.camps ?? [], nextEntityId);
  units.push(...camps.units);
  nextEntityId = camps.nextEntityId;

  const resources = options.resources ?? STARTING_RESOURCES;
  const stockHolders = [...(owner !== null ? [owner] : []), ...(options.players ?? [])];
  const stocks = Object.fromEntries(stockHolders.map((player) => [player, { ...resources }]));
  const fields = Object.fromEntries(
    buildings.filter((b) => productionOf(b.type)?.kind === 'farm').map((b) => [b.id, RIPE_FIELD]),
  );
  const initial: GameState = {
    tick: 0,
    buildings,
    construction: {},
    units,
    stocks,
    resourceNodes: {},
    fields,
    projectiles: [],
    towerCooldowns: {},
    upgrades: {},
    training: {},
    buildingDamage: {},
    ruins: [],
    wavesSent: 0,
    lastWaveAt: null,
    outcome: {},
    stats: {},
    nextEntityId,
  };
  // The map's heroes for each start slot that has a player.
  const slots = [owner, ...(options.players ?? [])];
  return (world.map.startingHeroes ?? []).reduce((state, start) => {
    const player = slots[start.player];
    return player ? spawnHero(state, start.hero, player, start).state : state;
  }, initial);
}

/** True for buildings of the hand-authored starting settlement (not placed by a player). */
export const isStartingBuilding = (world: SimWorld, building: Pick<BuildingInstance, 'id'>) =>
  building.id <= world.buildings.length;

export function toPlacedFootprint(
  building: Pick<BuildingInstance, 'type' | 'x' | 'z' | 'rotation'>,
): PlacedFootprint {
  return {
    x: building.x,
    z: building.z,
    rotation: building.rotation,
    footprint: footprintOf(building.type, building.rotation),
  };
}

/** True for a rotation that is an odd eighth turn (a diagonal wall segment). */
const isDiagonal = (rotation: number) => Math.round(rotation / (Math.PI / 4)) % 2 !== 0;

/**
 * The ground a building of `type` covers at `rotation`: its definition's footprint,
 * except that a diagonal wall segment is √2 longer than a straight one (it spans the
 * same distance along both axes).
 */
export function footprintOf(type: BuildingId, rotation: number): Footprint {
  const { footprint } = BUILDINGS[type];
  return isWall(type) && isDiagonal(rotation)
    ? { w: footprint.w * Math.SQRT2, d: footprint.d }
    : footprint;
}
