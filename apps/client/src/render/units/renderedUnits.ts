import type { EntityId } from '@roe/shared';

export interface RenderedUnit {
  x: number;
  /** Ground height under the unit (without animation). */
  y: number;
  z: number;
}

/**
 * Interpolated unit positions as drawn in the current frame, by unit id. Written by
 * `Units` every frame; selection rings and screen-space picking read it, so they match
 * what the player sees. A plain module value: per-frame data never goes through React.
 */
export const renderedUnits = new Map<EntityId, RenderedUnit>();
