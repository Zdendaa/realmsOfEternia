import { BUILDINGS, type BuildingDefinition } from '@roe/game-data';
import { useMemo } from 'react';
import { useGameStore } from '../../../state/gameStore';
import { SmokePuffs, type SmokeStyle } from '../SmokePuffs';
import { busyBuildings } from './busyBuildings';
import type { AnimatedBuilding } from './SpinningParts';

/** Light grey chimney smoke. */
const CHIMNEY_SMOKE: SmokeStyle = {
  color: '#d9d5cc',
  opacity: 0.55,
  maxPuffs: 96,
  emitEvery: 0.45,
  lifetime: 3.2,
  rise: 3,
  drift: 0.9,
  startSize: 0.25,
  endSize: 0.75,
};

/** Chimney top in world space for a building (model point rotated, scaled, placed). */
function chimneyOf({ building, y }: AnimatedBuilding) {
  const definition = BUILDINGS[building.type] as BuildingDefinition;
  const from = definition.smokeFrom;
  if (!from) return null;
  const angle = building.rotation + definition.rotationOffset;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const s = definition.scale;
  return {
    id: building.id,
    x: building.x + (from.x * cos + from.z * sin) * s,
    y: y + from.y * s,
    z: building.z + (-from.x * sin + from.z * cos) * s,
  };
}

/**
 * Smoke from the chimneys of buildings whose worker is at work (the bakery): soft grey
 * puffs that rise, drift with a light wind, swell and shrink away.
 */
export function ChimneySmoke({ buildings }: { buildings: readonly AnimatedBuilding[] }) {
  const chimneys = useMemo(
    () => buildings.map(chimneyOf).filter((c): c is NonNullable<typeof c> => c !== null),
    [buildings],
  );
  const emitters = () => {
    const busy = busyBuildings(useGameStore.getState().state.units);
    return chimneys.filter((chimney) => busy.has(chimney.id));
  };
  return <SmokePuffs emitters={emitters} style={CHIMNEY_SMOKE} />;
}
