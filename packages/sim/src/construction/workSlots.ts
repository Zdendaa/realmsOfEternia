import { BUILDINGS } from '@roe/game-data';
import type { Vec2 } from '@roe/shared';
import type { BuildingInstance } from '../state/gameState.js';

/** Builders stand this far outside the site's footprint. */
const SLOT_MARGIN = 0.9;

/**
 * Where builders stand around a construction site: `maxBuilders` points spread evenly
 * along the footprint's outline, starting in front of the entrance (local +Z).
 */
export function workSlots(site: Pick<BuildingInstance, 'type' | 'x' | 'z' | 'rotation'>): Vec2[] {
  const definition = BUILDINGS[site.type];
  const hw = definition.footprint.w / 2 + SLOT_MARGIN;
  const hd = definition.footprint.d / 2 + SLOT_MARGIN;
  const perimeter = 4 * (hw + hd);
  const count = definition.maxBuilders;
  const cos = Math.cos(site.rotation);
  const sin = Math.sin(site.rotation);
  const slots: Vec2[] = [];
  for (let k = 0; k < count; k++) {
    const local = pointOnOutline(hw, hd, (k / count) * perimeter);
    // Local X → (cos, -sin), local Z → (sin, cos), as in three.js rotation.y.
    slots.push({
      x: site.x + local.x * cos + local.z * sin,
      z: site.z - local.x * sin + local.z * cos,
    });
  }
  return slots;
}

/** Point at distance `s` along a rectangle's outline, starting at the front center (0, hd). */
function pointOnOutline(hw: number, hd: number, s: number): Vec2 {
  // Walk: front edge to +X corner, right edge, back edge, left edge, front edge back to start.
  const segments: [Vec2, Vec2][] = [
    [
      { x: 0, z: hd },
      { x: hw, z: hd },
    ],
    [
      { x: hw, z: hd },
      { x: hw, z: -hd },
    ],
    [
      { x: hw, z: -hd },
      { x: -hw, z: -hd },
    ],
    [
      { x: -hw, z: -hd },
      { x: -hw, z: hd },
    ],
    [
      { x: -hw, z: hd },
      { x: 0, z: hd },
    ],
  ];
  let remaining = s;
  for (const [a, b] of segments) {
    const length = Math.abs(b.x - a.x) + Math.abs(b.z - a.z);
    if (remaining <= length) {
      const t = length === 0 ? 0 : remaining / length;
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    }
    remaining -= length;
  }
  return { x: 0, z: hd };
}
