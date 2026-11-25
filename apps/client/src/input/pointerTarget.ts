import { UNITS } from '@roe/game-data';
import { isInPlayableArea, type Decoration, type EntityId, type Vec2 } from '@roe/shared';
import {
  areEnemies,
  isAlive,
  isWalkable,
  nearestWalkablePoint,
  PLACEMENT_RULES,
  remainingAmount,
  type BuildingInstance,
} from '@roe/sim';
import { Raycaster, Vector2, Vector3, type Camera } from 'three';
import { pickBuilding } from '../render/picking/pickBuilding';
import { unitAt } from '../render/picking/screenPick';
import { pickGround } from '../render/placement/groundPick';
import { LOCAL_PLAYER, useGameStore } from '../state/gameStore';

/** Ground under the pointer. */
export interface GroundTarget {
  x: number;
  y: number;
  z: number;
  /** Units can walk here (nav grid: no water, steep slope, building, tree or rock). */
  walkable: boolean;
  /**
   * Where units sent here end up: this point when walkable, else the nearest walkable
   * spot (the same rule as the sim's pathfinding goal); null outside the playable area
   * or when nothing walkable is near.
   */
  reachable: Vec2 | null;
  /** The tree or rock occupying this spot, if any (depleted ones are gone). */
  resource: Decoration | null;
  /** The resource can be harvested: inside the playable area, with something left. */
  harvestable: boolean;
}

/**
 * Everything under one screen point, in layers. Selection, unit commands and the hover
 * cursor all read this, each with its own priority, so they always agree.
 */
export interface PointerTarget {
  /** An own unit drawn under the pointer (screen-space pick). */
  unitId: EntityId | null;
  /** A living enemy unit drawn under the pointer (when no own unit is). */
  enemyId: EntityId | null;
  /** The building whose box the ray hits first. */
  building: BuildingInstance | null;
  /** Where the ray hits the terrain; null if it misses (sky, beyond the map). */
  ground: GroundTarget | null;
}

/** A tree or rock counts as under the pointer this far beyond its blocking radius. */
const RESOURCE_PICK_MARGIN = 0.4;

const raycaster = new Raycaster();
const ndc = new Vector2();
const hit = new Vector3();

/** The local player's units that take orders (workers don't, so they can't be selected). */
export const ownUnitIds = (): EntityId[] =>
  useGameStore
    .getState()
    .state.units.filter(
      (u) => u.ownerId === LOCAL_PLAYER && isAlive(u) && UNITS[u.type].controllable,
    )
    .map((u) => u.id);

/** Living units of the local player's enemies (what attacks can target). */
export const enemyUnitIds = (): EntityId[] =>
  useGameStore
    .getState()
    .state.units.filter((u) => isAlive(u) && areEnemies(LOCAL_PLAYER, u.ownerId))
    .map((u) => u.id);

/** Tree or rock whose blocking circle (plus a margin) contains (x, z), nearest first. */
function resourceAt(x: number, z: number): Decoration | null {
  const { world, state } = useGameStore.getState();
  const reach = 2.5;
  let best: Decoration | null = null;
  let bestDistance = Infinity;
  for (const d of world.obstacleIndex.query({
    minX: x - reach,
    maxX: x + reach,
    minZ: z - reach,
    maxZ: z + reach,
  })) {
    const radius =
      (d.kind === 'tree' ? PLACEMENT_RULES.treeRadius : PLACEMENT_RULES.rockRadius) * d.scale +
      RESOURCE_PICK_MARGIN;
    const distance = Math.hypot(d.x - x, d.z - z);
    if (state.resourceNodes[d.id] === 0) continue; // depleted: gone from the world
    if (distance < radius && distance < bestDistance) {
      bestDistance = distance;
      best = d;
    }
  }
  return best;
}

/** Picks every layer under client point (x, y) on `element` with one ray. */
export function pickPointerTarget(
  element: HTMLElement,
  camera: Camera,
  x: number,
  y: number,
): PointerTarget {
  const { state, heights, ctx, world } = useGameStore.getState();
  const rect = element.getBoundingClientRect();
  ndc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const ray = raycaster.ray;

  const unitId = unitAt(ownUnitIds(), camera, rect, x, y);
  const enemyId = unitId === null ? unitAt(enemyUnitIds(), camera, rect, x, y) : null;
  const building = pickBuilding(ray, state.buildings, heights);
  let ground: GroundTarget | null = null;
  if (pickGround(ray, heights, hit)) {
    const walkable = isWalkable(ctx.nav, hit.x, hit.z);
    const resource = walkable ? null : resourceAt(hit.x, hit.z);
    ground = {
      x: hit.x,
      y: hit.y,
      z: hit.z,
      walkable,
      reachable: isInPlayableArea(world.map, hit.x, hit.z)
        ? nearestWalkablePoint(ctx.nav, hit.x, hit.z)
        : null,
      resource,
      harvestable:
        resource !== null && remainingAmount(world, state.resourceNodes, resource.id) > 0,
    };
  }
  return { unitId, enemyId, building, ground };
}
