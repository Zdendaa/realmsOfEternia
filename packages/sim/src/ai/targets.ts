import { AI_RULES, isWall, towerOf, trainsOf, UNITS } from '@roe/game-data';
import type { Vec2 } from '@roe/shared';
import { depositAt, lacksSource } from './deposits.js';
import type { AiKnowledge } from './knowledge.js';
import type { ManagerInput } from './manager.js';
import type { AiSighting } from './state.js';
import { distanceSq, within } from './strength.js';

/** Towers this close to a building defend it. */
const TOWER_COVER = 14;
/** How much farther it would rather go than attack past one tower. */
const TOWER_COST = 15;
/** How much farther it would rather go to get at a Town Hall, which decides the game. */
const TOWN_HALL_PULL = 20;

/** Where its army waits: before its Town Hall, toward the middle of the map. */
export function rallyPoint(hall: Vec2, distance: number = AI_RULES.rallyDistance): Vec2 {
  const length = Math.hypot(hall.x, hall.z);
  if (length < 1) return { x: hall.x, z: hall.z + distance };
  return {
    x: Math.round(hall.x - (hall.x / length) * distance),
    z: Math.round(hall.z - (hall.z / length) * distance),
  };
}

/**
 * The enemy building it would attack from \`from\`, of those it knows of: near ones first,
 * shy of towers, drawn to Town Halls and to where its allies already are. Walls are
 * never a target of their own (units break them when in the way). Null when it knows of
 * none.
 */
export function chooseTarget(input: ManagerInput, from: Vec2): AiSighting | null {
  const { knowledge, memory } = input;
  const towers = memory.sightings.filter((s) => towerOf(s.type));
  const { radius, bonus } = AI_RULES.allyPull;
  let best: AiSighting | null = null;
  let bestScore = Infinity;
  for (const sighting of memory.sightings) {
    if (isWall(sighting.type) || !knowledge.isEnemy(sighting.owner)) continue;
    const cover = towers.filter((t) => t.id !== sighting.id && within(t, sighting, TOWER_COVER));
    let score = Math.sqrt(distanceSq(from, sighting)) + cover.length * TOWER_COST;
    if (sighting.type === 'townHall') score -= TOWN_HALL_PULL;
    if (knowledge.allyUnits.some((u) => within(u, sighting, radius))) score -= bonus;
    if (score < bestScore) {
      best = sighting;
      bestScore = score;
    }
  }
  return best;
}

/** A deposit whose guards it means to drive off, with the strength it wants for that. */
export interface CampTarget {
  deposit: number;
  at: Vec2;
  need: number;
}

/**
 * Whether its army can't grow by waiting: nothing is in training, and every unit it
 * could train needs an ore it hasn't enough of and has no mine for.
 */
export function cannotGrow({ knowledge }: ManagerInput): boolean {
  if (Object.keys(knowledge.training).length > 0) return false;
  const trainable = knowledge.buildings.flatMap((b) =>
    b.status === 'complete' ? trainsOf(b.type) : [],
  );
  if (trainable.length === 0) return false;
  return trainable.every((kind) => lacksSource(knowledge, UNITS[kind].cost));
}

/**
 * The camp it would clear next: on a deposit in its surroundings that it hasn't seen
 * unguarded, the one it reckons weakest (iron first among equals). What it hasn't seen
 * it takes to be worth \`unknownCamp\`; each time a camp beats it off it wants more.
 */
export function chooseCamp(input: ManagerInput): CampTarget | null {
  const { knowledge, memory, difficulty } = input;
  const hall = knowledge.townHall;
  if (!hall) return null;
  // With nothing more to come, it dares what it would otherwise grow for first.
  const stuck = cannotGrow(input);
  const mined = new Set(knowledge.buildings.map((b) => depositAt(knowledge.deposits, b)));
  let best: CampTarget | null = null;
  knowledge.deposits.forEach((deposit, i) => {
    if (memory.deposits[i] === 'clear' || mined.has(i)) return;
    if (!within(deposit, hall, AI_RULES.farGatherRadius)) return;
    const caution = (memory.army.failed[i] ?? 0) * AI_RULES.campCaution;
    const margin = stuck ? 1 : difficulty.campMargin + caution;
    const need = (memory.guards[i] ?? AI_RULES.unknownCamp) * margin;
    const better = !best || need < best.need || (need === best.need && deposit.kind === 'iron');
    if (better) best = { deposit: i, at: { x: deposit.x, z: deposit.z }, need };
  });
  return best;
}

/**
 * The start position it would look at next for the enemy: the nearest one, other than
 * its own, that it hasn't had in sight.
 */
export function unscouted(knowledge: AiKnowledge, visited: readonly number[], from: Vec2) {
  const open = knowledge.startSlots
    .map((slot, index) => ({ index, x: slot.x, z: slot.z }))
    .filter((slot) => !visited.includes(slot.index))
    .sort((a, b) => distanceSq(a, from) - distanceSq(b, from) || a.index - b.index);
  return open[0] ?? null;
}
