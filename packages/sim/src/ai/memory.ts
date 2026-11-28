import { AI_RULES } from '@roe/game-data';
import { SIMULATION_TICK_RATE, type DepositDefinition, type Vec2 } from '@roe/shared';
import type { AiKnowledge } from './knowledge.js';
import type { AiDanger, AiDeposit, AiState } from './state.js';

/** Sightings closer together than this are one danger. */
const SAME_DANGER = 8;
/** Serfs and buildings stay this far from a deposit it hasn't seen unguarded. */
export const GUARDED_DEPOSIT_RADIUS = 18;

const within = (a: Vec2, b: Vec2, radius: number) =>
  (a.x - b.x) ** 2 + (a.z - b.z) ** 2 <= radius * radius;

/** Whether `point` is near a place it remembers enemies at. */
export const isDangerous = (ai: Pick<AiState, 'dangers'>, point: Vec2) =>
  ai.dangers.some((danger) => within(danger, point, AI_RULES.dangerRadius));

/**
 * Whether serfs and buildings should keep away from `point`: enemies were seen there, or
 * it lies by an ore deposit it hasn't seen unguarded (monsters camp on them).
 */
export const isUnsafe = (
  ai: Pick<AiState, 'dangers' | 'deposits'>,
  deposits: readonly DepositDefinition[],
  point: Vec2,
) =>
  isDangerous(ai, point) ||
  deposits.some(
    (deposit, i) => ai.deposits[i] !== 'clear' && within(deposit, point, GUARDED_DEPOSIT_RADIUS),
  );

/**
 * The dangers after this look: enemies in sight are added or refreshed; a remembered one
 * is dropped once its spot is in sight with nobody there, or after
 * `dangerMemorySeconds` unseen.
 */
function rememberDangers(ai: AiState, knowledge: AiKnowledge): readonly AiDanger[] {
  const { tick, enemyUnits } = knowledge;
  const oldest = tick - AI_RULES.dangerMemorySeconds * SIMULATION_TICK_RATE;
  const kept = ai.dangers.filter(
    (danger) =>
      danger.at >= oldest &&
      (!knowledge.sees(danger) || enemyUnits.some((u) => within(u, danger, SAME_DANGER))),
  );
  const next: AiDanger[] = [...kept];
  for (const unit of enemyUnits) {
    const known = next.findIndex((d) => within(d, unit, SAME_DANGER));
    if (known < 0) next.push({ x: Math.round(unit.x), z: Math.round(unit.z), at: tick });
    else next[known] = { ...(next[known] as AiDanger), at: tick };
  }
  const same =
    next.length === ai.dangers.length &&
    next.every((d, i) => {
      const before = ai.dangers[i] as AiDanger;
      // A danger watched without a break is written down once a second, not every look.
      return d.x === before.x && d.z === before.z && d.at - before.at < SIMULATION_TICK_RATE;
    });
  return same ? ai.dangers : next;
}

/** The deposits after this look: every one in sight is marked clear or held. */
function rememberDeposits(ai: AiState, knowledge: AiKnowledge): AiState['deposits'] {
  let next: Record<number, AiDeposit> | null = null;
  knowledge.deposits.forEach((deposit, i) => {
    if (!knowledge.sees(deposit)) return;
    const held = knowledge.enemyUnits.some((u) => within(u, deposit, GUARDED_DEPOSIT_RADIUS));
    const seen: AiDeposit = held ? 'held' : 'clear';
    if ((next ?? ai.deposits)[i] === seen) return;
    next ??= { ...ai.deposits };
    next[i] = seen;
  });
  return next ?? ai.deposits;
}

/** The memory after looking at `knowledge`; the same object when nothing new was learned. */
export function observe(ai: AiState, knowledge: AiKnowledge): AiState {
  const dangers = rememberDangers(ai, knowledge);
  const deposits = rememberDeposits(ai, knowledge);
  return dangers === ai.dangers && deposits === ai.deposits ? ai : { ...ai, dangers, deposits };
}
