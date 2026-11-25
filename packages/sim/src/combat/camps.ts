import { isUnitKind } from '@roe/game-data';
import type { CampDefinition, EntityId } from '@roe/shared';
import { createUnit, type UnitInstance } from '../state/units.js';
import { formationOffsets } from '../units/orders.js';
import { MONSTER_PLAYER } from './hostility.js';

/**
 * The guards of every camp, owned by the monsters: spread around the camp's center, each
 * with its spot as `home` (leash and return point). Unknown unit kinds are skipped.
 * Returns the units and the next free entity id.
 */
export function spawnCamps(
  camps: readonly CampDefinition[],
  nextEntityId: EntityId,
): { units: UnitInstance[]; nextEntityId: EntityId } {
  const units: UnitInstance[] = [];
  let next = nextEntityId;
  for (const camp of camps) {
    const kinds = camp.units.flatMap(({ unit, count }) =>
      isUnitKind(unit) ? Array.from({ length: count }, () => unit) : [],
    );
    const offsets = formationOffsets(kinds.length);
    kinds.forEach((kind, i) => {
      const offset = offsets[i] ?? { x: 0, z: 0 };
      const at = { x: camp.x + offset.x * 1.4, z: camp.z + offset.z * 1.4 };
      const guard = createUnit(next++, kind, MONSTER_PLAYER, at);
      if (guard.combat) guard.combat = { ...guard.combat, home: at };
      units.push(guard);
    });
  }
  return { units, nextEntityId: next };
}
