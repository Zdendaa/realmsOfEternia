import { useGLTF } from '@react-three/drei';
import { BUILDINGS } from '@roe/game-data';
import { useMemo } from 'react';
import type { PlacedBuilding } from '../../../world/createWorld';
import { BuildingInstances } from './BuildingInstances';
import { publicUrl } from './modelAssets';

// Start downloading every building model as soon as this module loads.
for (const building of Object.values(BUILDINGS)) {
  useGLTF.preload(publicUrl(building.modelPath), false);
}

interface SettlementProps {
  buildings: readonly PlacedBuilding[];
}

/** Renders placed buildings, grouped by type so repeated models are instanced. */
export function Settlement({ buildings }: SettlementProps) {
  const byType = useMemo(() => {
    const groups = new Map<string, PlacedBuilding[]>();
    for (const building of buildings) {
      const group = groups.get(building.definition.id);
      if (group) group.push(building);
      else groups.set(building.definition.id, [building]);
    }
    return [...groups.values()];
  }, [buildings]);

  return (
    <>
      {byType.map((placements) => {
        const definition = placements[0]?.definition;
        return definition ? (
          <BuildingInstances key={definition.id} definition={definition} placements={placements} />
        ) : null;
      })}
    </>
  );
}
