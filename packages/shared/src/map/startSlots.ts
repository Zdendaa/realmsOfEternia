import type { Vec2 } from '../types.js';
import type { MapDefinition, QuarterTurns, StartSlotDefinition } from './types.js';

const CENTER_SLOT: readonly StartSlotDefinition[] = [{ x: 0, z: 0, quarterTurns: 0 }];

/** The map's start slots; a map without any has one at its center. */
export const startSlotsOf = (map: MapDefinition): readonly StartSlotDefinition[] =>
  map.startSlots ?? CENTER_SLOT;

/** (x, z) turned around the origin in 90° steps, exactly (no trigonometry). */
export function turnPoint({ x, z }: Vec2, quarterTurns: QuarterTurns): Vec2 {
  switch (quarterTurns) {
    case 0:
      return { x, z };
    case 1:
      return { x: z, z: -x };
    case 2:
      return { x: -x, z: -z };
    case 3:
      return { x: -z, z: x };
  }
}

/** A point of the starting settlement (its own coordinates) placed at `slot`. */
export function toSlotPoint(slot: StartSlotDefinition, point: Vec2): Vec2 {
  const turned = turnPoint(point, slot.quarterTurns);
  return { x: slot.x + turned.x, z: slot.z + turned.z };
}
