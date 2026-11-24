import { useFrame } from '@react-three/fiber';
import { SIMULATION_TICK_MS } from '@roe/shared';
import { useRef } from 'react';
import { useGameStore } from '../../state/gameStore';
import { simClock } from './simClock';

const TICK_SECONDS = SIMULATION_TICK_MS / 1000;
/** Longest frame gap that is caught up on; longer pauses (a hidden tab) are dropped. */
const MAX_CATCH_UP = 0.25;

/**
 * Runs the simulation at its fixed tick rate from the render loop (fixed-timestep
 * accumulator) and publishes the interpolation factor. Mount it before anything that
 * reads `simClock`, so its frame callback runs first.
 */
export function SimulationDriver() {
  const accumulator = useRef(0);

  useFrame((_, delta) => {
    const frame = Math.min(delta, MAX_CATCH_UP);
    simClock.time += frame;
    accumulator.current += frame;
    while (accumulator.current >= TICK_SECONDS) {
      accumulator.current -= TICK_SECONDS;
      useGameStore.getState().advance();
    }
    simClock.alpha = accumulator.current / TICK_SECONDS;
  });

  return null;
}
