import { BUILDINGS, tileOffsets, type BuildingDefinition, type BuildingId } from '@roe/game-data';
import type { EntityId, Vec2 } from '@roe/shared';
import type { BuildingInstance } from './gameState.js';

/**
 * Where a field is in its cycle. `sowing`: the farmer sows plot by plot; `growing`: every
 * plot is sown and the crop ripens at tick `ripeAt`; `harvesting`: the farmer cuts plot by
 * plot and carries the crop away. After the last plot is harvested the field is sown again.
 */
export type FieldPhase = 'sowing' | 'growing' | 'harvesting';

/** One field's state. Integers only; it changes when a plot is done, never per tick. */
export interface FieldState {
  phase: FieldPhase;
  /** Plots sown (sowing) or harvested (harvesting) so far; 0 while growing. */
  plotsDone: number;
  /** Tick at which the crop is ripe (meaningful while growing). */
  ripeAt: number;
}

/** A field nobody has worked yet: bare soil, ready for sowing. */
export const FRESH_FIELD: FieldState = Object.freeze({ phase: 'sowing', plotsDone: 0, ripeAt: 0 });

/** A starting field: fully grown, ready for harvest from the first tick. */
export const RIPE_FIELD: FieldState = Object.freeze({ phase: 'growing', plotsDone: 0, ripeAt: 0 });

/** The state of field `id` (fields that have no record yet are fresh). */
export const fieldOf = (fields: Readonly<Record<EntityId, FieldState>>, id: EntityId): FieldState =>
  fields[id] ?? FRESH_FIELD;

/** True when the crop of a growing field has ripened by `tick`. */
export const isRipe = (field: FieldState, tick: number) =>
  field.phase === 'growing' && tick >= field.ripeAt;

const definitionOf = (type: BuildingId) => BUILDINGS[type] as BuildingDefinition;

/** Number of plots of a field type (its model tiles). */
export const plotCount = (type: BuildingId) => tileOffsets(definitionOf(type)).length;

export const FIELD_RULES = {
  /**
   * The farmer works a plot from the furrow between the two plot columns, this far from
   * the field's center line (local X), facing the plot.
   */
  furrowOffset: 0.6,
  /** A farmer counts as at the plot within this distance of its work point. */
  reach: 1,
} as const;

/** Rotates a local (x, z) offset of `building` into world space. */
function toWorld(building: Pick<BuildingInstance, 'x' | 'z' | 'rotation'>, x: number, z: number) {
  const cos = Math.cos(building.rotation);
  const sin = Math.sin(building.rotation);
  return { x: building.x + x * cos + z * sin, z: building.z - x * sin + z * cos };
}

/** World center of plot `index` (tile order, see `tileOffsets`). */
export function plotCenter(
  building: Pick<BuildingInstance, 'type' | 'x' | 'z' | 'rotation'>,
  index: number,
): Vec2 {
  const offset = tileOffsets(definitionOf(building.type))[index] ?? { x: 0, z: 0 };
  return toWorld(building, offset.x, offset.z);
}

/**
 * Where the farmer stands to work plot `index`: in the middle furrow, level with the
 * plot's center, so the crop never hides them.
 */
export function plotWorkPoint(
  building: Pick<BuildingInstance, 'type' | 'x' | 'z' | 'rotation'>,
  index: number,
): Vec2 {
  const offset = tileOffsets(definitionOf(building.type))[index] ?? { x: 0, z: 0 };
  const side = Math.sign(offset.x);
  return toWorld(building, side * FIELD_RULES.furrowOffset, offset.z);
}
