import { BUILDINGS, isBuildingId, type BuildingId } from '@roe/game-data';
import type { EntityId, PlacedFootprint, PlayerId } from '@roe/shared';
import type { SimWorld } from '../world/createWorld.js';

export interface BuildingInstance {
  id: EntityId;
  type: BuildingId;
  x: number;
  z: number;
  /** Y rotation in radians. */
  rotation: number;
  /** Owner; null for neutral buildings (the starting settlement, for now). */
  ownerId: PlayerId | null;
  /** Placement is instant for now; construction sites come with the economy. */
  status: 'complete';
}

/** Authoritative simulation state. Plain data: serializable, never mutated in place. */
export interface GameState {
  readonly buildings: readonly BuildingInstance[];
  readonly nextEntityId: EntityId;
}

/** The starting settlement becomes the first building instances (ids 1..n). */
export function createInitialState(world: SimWorld): GameState {
  const buildings = world.buildings.map((b, i): BuildingInstance => {
    const type = b.definition.id;
    if (!isBuildingId(type)) throw new Error(`Unknown building type "${type}"`);
    return {
      id: i + 1,
      type,
      x: b.x,
      z: b.z,
      rotation: b.rotation,
      ownerId: null,
      status: 'complete',
    };
  });
  return { buildings, nextEntityId: buildings.length + 1 };
}

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
