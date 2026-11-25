import type { PlacedFootprint } from '@roe/shared';
import { toPlacedFootprint, type BuildingInstance } from '@roe/sim';
import { useMemo } from 'react';

/**
 * The footprints of `buildings` as one array that stays the same object until a building
 * comes or goes. The buildings array also changes when a site is finished, which moves
 * nothing on the ground; layers that do heavy work per footprint (the grass: tens of
 * thousands of patches) key on this instead.
 */
export function useStableFootprints(
  buildings: readonly BuildingInstance[],
): readonly PlacedFootprint[] {
  const signature = buildings.map((b) => b.id).join(',');
  return useMemo(
    () => buildings.map(toPlacedFootprint),
    // A building never moves or turns: its id says everything about its footprint (a gate
    // gets a new id, and a tower upgrade keeps its footprint).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signature],
  );
}
