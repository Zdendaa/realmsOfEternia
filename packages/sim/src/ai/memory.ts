import { AI_RULES } from '@roe/game-data';
import {
  SIMULATION_TICK_RATE,
  type DepositDefinition,
  type EntityId,
  type Vec2,
} from '@roe/shared';
import type { AiKnowledge } from './knowledge.js';
import type { AiDanger, AiDeposit, AiSighting, AiState } from './state.js';
import { totalStrength, within } from './strength.js';

/** Sightings closer together than this are one danger. */
const SAME_DANGER = 8;
/** Serfs and buildings stay this far from a deposit it hasn't seen unguarded. */
export const GUARDED_DEPOSIT_RADIUS = 18;

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

/**
 * The guards it saw at each deposit the last time any were in sight, so a camp it has
 * thinned out counts for what is left of it.
 */
function rememberGuards(ai: AiState, knowledge: AiKnowledge): AiState['guards'] {
  let next: Record<number, number> | null = null;
  knowledge.deposits.forEach((deposit, i) => {
    if (!knowledge.sees(deposit)) return;
    const there = knowledge.enemyUnits.filter((u) => within(u, deposit, GUARDED_DEPOSIT_RADIUS));
    const strength = Math.ceil(totalStrength(there));
    if (strength === 0 || strength === (next ?? ai.guards)[i]) return;
    next ??= { ...ai.guards };
    next[i] = strength;
  });
  return next ?? ai.guards;
}

/**
 * Enemy buildings: those in sight are added or brought up to date; a remembered one is
 * dropped when its spot is in sight and it is gone.
 */
function rememberBuildings(ai: AiState, knowledge: AiKnowledge): readonly AiSighting[] {
  const seen = new Map<EntityId, AiSighting>();
  for (const b of knowledge.otherBuildings) {
    if (b.ownerId === null || !knowledge.isEnemy(b.ownerId)) continue;
    seen.set(b.id, { id: b.id, owner: b.ownerId, type: b.type, x: b.x, z: b.z });
  }
  let changed = false;
  const next: AiSighting[] = [];
  for (const old of ai.sightings) {
    const now = seen.get(old.id);
    seen.delete(old.id);
    // A defeated player's leftovers are forgotten.
    if (!knowledge.isEnemy(old.owner)) changed = true;
    else if (now) {
      changed ||= now.type !== old.type;
      next.push(now.type === old.type ? old : now);
    } else if (knowledge.sees(old)) changed = true;
    else next.push(old);
  }
  if (seen.size === 0) return changed ? next : ai.sightings;
  return [...next, ...seen.values()].sort((a, b) => a.id - b.id);
}

/** The start positions it has had in sight. */
function rememberVisits(ai: AiState, knowledge: AiKnowledge): AiState['visited'] {
  const fresh = knowledge.startSlots.flatMap((slot, i) =>
    !ai.visited.includes(i) && knowledge.sees(slot) ? [i] : [],
  );
  return fresh.length > 0 ? [...ai.visited, ...fresh] : ai.visited;
}

/** The memory after looking at `knowledge`; the same object when nothing new was learned. */
export function observe(ai: AiState, knowledge: AiKnowledge): AiState {
  const next = {
    dangers: rememberDangers(ai, knowledge),
    deposits: rememberDeposits(ai, knowledge),
    guards: rememberGuards(ai, knowledge),
    sightings: rememberBuildings(ai, knowledge),
    visited: rememberVisits(ai, knowledge),
  };
  const same = Object.entries(next).every(([key, value]) => ai[key as keyof AiState] === value);
  return same ? ai : { ...ai, ...next };
}
