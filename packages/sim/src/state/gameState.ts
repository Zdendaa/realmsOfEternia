import {
  BUILDINGS,
  isBuildingId,
  STARTING_RESOURCES,
  type BuildingId,
  type ResourceAmounts,
} from '@roe/game-data';
import type { EntityId, PlacedFootprint, PlayerId } from '@roe/shared';
import type { SimWorld } from '../world/createWorld.js';
import { IDLE, type UnitInstance } from './units.js';
import { spawnPoint } from './spawn.js';

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
 * the starting serfs next to the first Town Hall.
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
      const at = spawnPoint(townHall, i);
      units.push({
        id: nextEntityId++,
        type: 'serf',
        ownerId: owner,
        x: at.x,
        z: at.z,
        task: IDLE,
        movement: null,
        activity: 'idle',
        carrying: null,
      });
    }
  }
  const resources = options.resources ?? STARTING_RESOURCES;
  const stockHolders = [...(owner !== null ? [owner] : []), ...(options.players ?? [])];
  const stocks = Object.fromEntries(stockHolders.map((player) => [player, { ...resources }]));
  return { tick: 0, buildings, construction: {}, units, stocks, resourceNodes: {}, nextEntityId };
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
    footprint: BUILDINGS[building.type].footprint,
  };
}
