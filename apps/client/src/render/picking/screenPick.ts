import { CHARACTER_PACK, combatOf, SIEGE_MODELS, SIEGE_SIZE, type UnitKind } from '@roe/game-data';
import type { EntityId } from '@roe/shared';
import { Vector3, type Camera } from 'three';
import { renderedUnits } from '../units/renderedUnits';

/** Height above the ground that counts as a unit's center on screen: half its height. */
const UNIT_CENTER_HEIGHT = 0.5 * CHARACTER_PACK.serf.height * CHARACTER_PACK.serf.scale;
/** A click this close (px) to a unit's center selects it. */
const CLICK_RADIUS = 18;
/** Siege engines are wider than people: easier to hit. */
const LARGE_CENTER_HEIGHT = 0.5 * SIEGE_MODELS.ram.height * SIEGE_SIZE.modelScale;
const LARGE_CLICK_RADIUS = 26;

const isLarge = (type: UnitKind) => combatOf(type).armorClass === 'siege';

const point = new Vector3();

interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Screen position (client px) of a unit as drawn this frame, or null if off camera. */
function unitOnScreen(id: EntityId, camera: Camera, rect: ScreenRect) {
  const unit = renderedUnits.get(id);
  if (!unit) return null;
  const height = isLarge(unit.type) ? LARGE_CENTER_HEIGHT : UNIT_CENTER_HEIGHT;
  point.set(unit.x, unit.y + height, unit.z).project(camera);
  if (point.z > 1 || point.z < -1) return null;
  return {
    reach: isLarge(unit.type) ? LARGE_CLICK_RADIUS : CLICK_RADIUS,
    x: rect.left + ((point.x + 1) / 2) * rect.width,
    y: rect.top + ((1 - point.y) / 2) * rect.height,
  };
}

/**
 * Units are picked in screen space: project each candidate and compare in pixels.
 * Cheap for hundreds of units and independent of the (instanced) meshes.
 */
export function unitAt(
  candidates: readonly EntityId[],
  camera: Camera,
  rect: ScreenRect,
  x: number,
  y: number,
): EntityId | null {
  let best: EntityId | null = null;
  // The nearest relative to its own click radius.
  let bestDistance = 1;
  for (const id of candidates) {
    const p = unitOnScreen(id, camera, rect);
    if (!p) continue;
    const distance = Math.hypot(p.x - x, p.y - y) / p.reach;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = id;
    }
  }
  return best;
}

/** Candidates whose screen position lies inside the rectangle spanned by two corners. */
export function unitsInBox(
  candidates: readonly EntityId[],
  camera: Camera,
  rect: ScreenRect,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): EntityId[] {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  return candidates.filter((id) => {
    const p = unitOnScreen(id, camera, rect);
    return p !== null && p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;
  });
}
