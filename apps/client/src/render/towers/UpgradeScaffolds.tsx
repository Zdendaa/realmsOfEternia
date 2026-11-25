import { HEXAGON_PACK } from '@roe/game-data';
import type { HeightField } from '@roe/shared';
import { footprintOf, type BuildingInstance } from '@roe/sim';
import { Suspense, useMemo } from 'react';
import { LOCAL_PLAYER, useGameStore } from '../../state/gameStore';
import { ModelInstances, type ModelInstance } from '../scene/settlement/ModelInstances';

const { scaffolding, scaffoldingSize } = HEXAGON_PACK.construction;
/** A little wider than the footprint, so it stands around the tower. */
const SPREAD = 1.15;

/** The pack's scaffolding around the player's towers that are being upgraded. */
export function UpgradeScaffolds({
  buildings,
  heights,
}: {
  buildings: readonly BuildingInstance[];
  heights: HeightField;
}) {
  // Changes only when an upgrade starts or ends.
  const ids = useGameStore((s) => Object.keys(s.state.upgrades).join(','));
  const instances = useMemo(() => {
    const upgrading = new Set(ids.split(',').map(Number));
    return buildings
      .filter((b) => b.ownerId === LOCAL_PLAYER && upgrading.has(b.id))
      .map((b): ModelInstance => {
        const { w, d } = footprintOf(b.type, b.rotation);
        return {
          x: b.x,
          y: heights.getHeightAt(b.x, b.z),
          z: b.z,
          rotation: b.rotation,
          scale: Math.max(w / scaffoldingSize.w, d / scaffoldingSize.d) * SPREAD,
        };
      });
  }, [ids, buildings, heights]);
  if (instances.length === 0) return null;
  return (
    <Suspense fallback={null}>
      <ModelInstances key={instances.length} modelPath={scaffolding} instances={instances} />
    </Suspense>
  );
}
