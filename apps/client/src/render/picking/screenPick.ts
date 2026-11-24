import type { EntityId } from '@roe/shared';
import { Vector3, type Camera } from 'three';
import { renderedUnits } from '../units/renderedUnits';

/** Height above the ground that counts as a unit's center on screen. */
const UNIT_CENTER_HEIGHT = 0.65;
/** A click this close (px) to a unit's center selects it. */
const CLICK_RADIUS = 18;

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
  point.set(unit.x, unit.y + UNIT_CENTER_HEIGHT, unit.z).project(camera);
  if (point.z > 1 || point.z < -1) return null;
  return {
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
  let bestDistance = CLICK_RADIUS;
  for (const id of candidates) {
    const p = unitOnScreen(id, camera, rect);
    if (!p) continue;
    const distance = Math.hypot(p.x - x, p.y - y);
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
