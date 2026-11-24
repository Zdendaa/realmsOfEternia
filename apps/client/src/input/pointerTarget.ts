import type { Decoration, EntityId } from '@roe/shared';
import { isWalkable, PLACEMENT_RULES, type BuildingInstance } from '@roe/sim';
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
  /** The tree or rock occupying this spot, if any. */
  resource: Decoration | null;
}

/**
 * Everything under one screen point, in layers. Selection, unit commands and the hover
 * cursor all read this, each with its own priority, so they always agree.
 */
export interface PointerTarget {
  /** An own unit drawn under the pointer (screen-space pick). */
  unitId: EntityId | null;
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

export const ownUnitIds = (): EntityId[] =>
  useGameStore
    .getState()
    .state.units.filter((u) => u.ownerId === LOCAL_PLAYER)
    .map((u) => u.id);

/** Tree or rock whose blocking circle (plus a margin) contains (x, z), nearest first. */
function resourceAt(x: number, z: number): Decoration | null {
  const { world } = useGameStore.getState();
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
  const { state, heights, ctx } = useGameStore.getState();
  const rect = element.getBoundingClientRect();
  ndc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const ray = raycaster.ray;

  const unitId = unitAt(ownUnitIds(), camera, rect, x, y);
  const building = pickBuilding(ray, state.buildings, heights);
  let ground: GroundTarget | null = null;
  if (pickGround(ray, heights, hit)) {
    const walkable = isWalkable(ctx.nav, hit.x, hit.z);
    ground = {
      x: hit.x,
      y: hit.y,
      z: hit.z,
      walkable,
      resource: walkable ? null : resourceAt(hit.x, hit.z),
    };
  }
  return { unitId, building, ground };
}
