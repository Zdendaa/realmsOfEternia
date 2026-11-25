import { useGLTF } from '@react-three/drei';
import { BUILDINGS, HEXAGON_PACK } from '@roe/game-data';
import { distanceToFootprint, SIMULATION_TICK_RATE, type HeightField } from '@roe/shared';
import { toPlacedFootprint, type BuildingInstance, type Ruin } from '@roe/sim';
import { useMemo } from 'react';
import { useGameStore } from '../../state/gameStore';
import { publicUrl } from './settlement/modelAssets';
import { ModelInstances, type ModelInstance } from './settlement/ModelInstances';
import { SmokePuffs, type SmokeEmitter, type SmokeStyle } from './SmokePuffs';

useGLTF.preload(publicUrl(HEXAGON_PACK.ruin.model), false);

/** Share of the footprint the rubble covers. */
const RUIN_FILL = 0.9;
/** Seconds a ruin smokes after the building fell. */
const SMOKE_SECONDS = 45;
/** Height of the smoke source above the ground. */
const SMOKE_HEIGHT = 1.2;

/** Dark, heavy smoke from burning rubble. */
const RUIN_SMOKE: SmokeStyle = {
  color: '#4a4541',
  opacity: 0.4,
  maxPuffs: 160,
  emitEvery: 0.35,
  lifetime: 4.5,
  rise: 7,
  drift: 1.8,
  startSize: 0.3,
  endSize: 1.0,
};

/** Uniform scale that fits the rubble model to `RUIN_FILL` of the footprint. */
function ruinScale(ruin: Ruin): number {
  const { w, d } = BUILDINGS[ruin.type].footprint;
  const { size } = HEXAGON_PACK.ruin;
  return Math.min((w * RUIN_FILL) / size.w, (d * RUIN_FILL) / size.d);
}

/**
 * Where buildings were destroyed (`GameState.ruins`): the Hexagon pack's rubble, sized to
 * the footprint, and dark smoke for the first minute or so. A ruin under a building built
 * on the spot later is hidden. Cosmetic only: ruins block nothing.
 */
export function Ruins({
  ruins,
  buildings,
  heights,
}: {
  ruins: readonly Ruin[];
  buildings: readonly BuildingInstance[];
  heights: HeightField;
}) {
  const visible = useMemo(() => {
    const footprints = buildings.map(toPlacedFootprint);
    return ruins.filter((r) => !footprints.some((f) => distanceToFootprint(f, r.x, r.z) === 0));
  }, [ruins, buildings]);
  const instances = useMemo(
    () =>
      visible.map((r): ModelInstance => ({
        x: r.x,
        y: heights.getHeightAt(r.x, r.z),
        z: r.z,
        rotation: r.rotation,
        scale: ruinScale(r),
      })),
    [visible, heights],
  );
  const sources = useMemo(
    () =>
      visible.map((r): SmokeEmitter & { destroyedAt: number } => ({
        id: r.id,
        x: r.x,
        y: heights.getHeightAt(r.x, r.z) + SMOKE_HEIGHT,
        z: r.z,
        destroyedAt: r.destroyedAt,
      })),
    [visible, heights],
  );
  const emitters = () => {
    const tick = useGameStore.getState().state.tick;
    const limit = SMOKE_SECONDS * SIMULATION_TICK_RATE;
    return sources.filter((s) => tick - s.destroyedAt < limit);
  };

  return (
    <>
      {instances.length > 0 && (
        <ModelInstances modelPath={HEXAGON_PACK.ruin.model} instances={instances} />
      )}
      <SmokePuffs emitters={emitters} style={RUIN_SMOKE} />
    </>
  );
}
