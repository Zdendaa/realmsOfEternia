import { AI_DIFFICULTIES } from '@roe/game-data';
import { createRng, SIMULATION_TICK_RATE, type Rng } from '@roe/shared';
import type { AiState } from './state.js';

export const thinkInterval = (ai: Pick<AiState, 'difficulty'>) =>
  Math.round(AI_DIFFICULTIES[ai.difficulty].thinkSeconds * SIMULATION_TICK_RATE);

/**
 * Whether the AI thinks on this tick: every `thinkInterval` ticks, shifted by its
 * `order`. Every interval is a multiple of the shortest one (5 ticks), which is more than
 * the seats there are, so two computer players never think on the same tick.
 */
export const isThinkTick = (ai: Pick<AiState, 'difficulty' | 'order'>, tick: number) =>
  tick % thinkInterval(ai) === ai.order % thinkInterval(ai);

/** Mixes whole numbers into one well-spread 32-bit seed. */
export function mixSeed(a: number, b: number): number {
  let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13) ^ (b | 0), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * The AI's randomness for one decision: fresh from its seed and the tick, so no generator
 * has to be kept, and a replay draws the same numbers.
 */
export const aiRng = (ai: Pick<AiState, 'seed'>, tick: number): Rng =>
  createRng(mixSeed(ai.seed, tick));
