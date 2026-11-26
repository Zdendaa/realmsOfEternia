import { useFrame } from '@react-three/fiber';
import { abilityOf } from '@roe/game-data';
import { SIMULATION_TICK_RATE } from '@roe/shared';
import { useEffect, useMemo } from 'react';
import type { MeshBasicMaterial } from 'three';
import { useGameStore } from '../../state/gameStore';
import { shownAt } from '../fog/knowledge';
import { simClock } from '../simulation/simClock';
import { createRangeRing } from './rangeRing';

/** Most bursts drawn at once. */
const CAPACITY = 8;
/** Seconds a burst takes to spread, and how long it shows in all. */
const SPREAD = 0.35;
const LENGTH = 1.1;
/** The ring drawn around a single targeted building. */
const BUILDING_RADIUS = 2.5;

/** The pool of rings and their per-frame update (a plain object, outside React). */
function createBursts() {
  const rings = Array.from({ length: CAPACITY }, () => createRangeRing());
  return {
    meshes: rings.map((ring) => ring.mesh),
    update() {
      const { state, heights } = useGameStore.getState();
      const now = state.tick - 1 + simClock.alpha;
      let used = 0;
      for (const cast of state.casts) {
        const age = (now - cast.tick) / SIMULATION_TICK_RATE;
        const ring = rings[used];
        if (!ring || age < 0 || age > LENGTH || !shownAt(cast.ownerId, cast.x, cast.z)) continue;
        used++;
        const ability = abilityOf(cast.ability);
        const full = ability.radius || BUILDING_RADIUS;
        const spread = Math.min(1, age / SPREAD);
        const material = ring.mesh.material as MeshBasicMaterial;
        material.color.set(ability.color);
        material.opacity = 0.95 * Math.min(1, (LENGTH - age) / (LENGTH - SPREAD));
        ring.place(cast.x, cast.z, full * (0.2 + 0.8 * spread), heights);
      }
      rings.forEach((ring, i) => {
        ring.mesh.visible = i < used;
      });
    },
    dispose() {
      for (const ring of rings) ring.dispose();
    },
  };
}

/**
 * An ability taking effect: a ring in its color spreads over the area it affects and
 * fades (a placeholder effect). Read from the state's recent casts.
 */
export function AbilityBursts() {
  const bursts = useMemo(() => createBursts(), []);
  useEffect(() => () => bursts.dispose(), [bursts]);
  useFrame(() => bursts.update());

  return (
    <>
      {bursts.meshes.map((mesh) => (
        <primitive key={mesh.uuid} object={mesh} />
      ))}
    </>
  );
}
