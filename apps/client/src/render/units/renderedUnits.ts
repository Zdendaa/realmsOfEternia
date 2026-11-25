import type { ProfessionId, ResourceId, UnitKind } from '@roe/game-data';
import type { EntityId, PlayerId } from '@roe/shared';
import type { UnitActivity } from '@roe/sim';

export interface RenderedUnit {
  id: EntityId;
  type: UnitKind;
  x: number;
  /** Ground height under the unit (without animation). */
  y: number;
  z: number;
  /** Facing (Y rotation, radians; 0 = +Z), smoothed toward the walking direction. */
  heading: number;
  activity: UnitActivity;
  /** What kind of work a working unit does (picks the animation and the tool). */
  work: UnitWork;
  /** A worker's profession (its hat and tunic), from its building; null for serfs. */
  profession: ProfessionId | null;
  /** Working inside its building (millers, bakers while processing): not drawn. */
  inside: boolean;
  /** The resource the unit carries, or null. */
  carrying: ResourceId | null;
  ownerId: PlayerId | null;
  /**
   * Seconds since the unit's current attack started (rendering time, so the swing lines
   * up with the simulation's strike), or null when it isn't attacking.
   */
  attackElapsed: number | null;
  /** Seconds since the unit died, or null while alive. */
  deathElapsed: number | null;
}

export type UnitWork = 'build' | 'chop' | 'mine' | 'sow' | 'reap';

/**
 * Units as drawn in the current frame: interpolated between ticks, with smoothed facing.
 * Written once per frame by `UnitFrameDriver`; unit renderers, selection rings and
 * screen-space picking read it, so they all match what the player sees. Plain module
 * values: per-frame data never goes through React.
 */
export const renderedUnits = new Map<EntityId, RenderedUnit>();
/** The same units in state order (the order instances are written in). */
export const renderedUnitList: RenderedUnit[] = [];
