import { AI_UNIT_STRENGTH, attackOf, UNITS } from '@roe/game-data';
import type { Vec2 } from '@roe/shared';
import { maxHealthOf } from '../heroes/heroes.js';
import type { UnitInstance } from '../state/units.js';

export const distanceSq = (a: Vec2, b: Vec2) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;

export const within = (a: Vec2, b: Vec2, radius: number) => distanceSq(a, b) <= radius * radius;

/** What a unit is worth in a fight now: its kind's strength, less what it has lost. */
export const strengthOf = (unit: UnitInstance) =>
  (AI_UNIT_STRENGTH[unit.type] * unit.health) / maxHealthOf(unit);

export const totalStrength = (units: readonly UnitInstance[]) =>
  units.reduce((sum, unit) => sum + strengthOf(unit), 0);

/** A unit that fights and takes orders: soldiers, siege engines and heroes. */
export const isSoldier = (unit: UnitInstance) =>
  UNITS[unit.type].controllable && attackOf(unit.type) !== undefined;
