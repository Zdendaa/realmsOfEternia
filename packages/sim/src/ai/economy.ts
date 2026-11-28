import {
  AI_RULES,
  BUILDINGS,
  depositOf,
  UNITS,
  type GatheredResource,
  type ResourceCost,
} from '@roe/game-data';
import { clamp, type Decoration, type DecorationKind, type EntityId } from '@roe/shared';
import { hasFreeHousing } from '../economy/population.js';
import type { UnitInstance } from '../state/units.js';
import { affords, spend } from './budget.js';
import { HOME_RADIUS } from './knowledge.js';
import type { AiProposal, ManagerInput } from './manager.js';
import { isUnsafe } from './memory.js';

const NODE_OF: Readonly<Record<GatheredResource, DecorationKind>> = {
  wood: 'tree',
  stone: 'rock',
};
const GATHERED = Object.keys(NODE_OF) as GatheredResource[];
/** A group is sent to one of this many nearest nodes (it spreads out from there). */
const NODE_CHOICES = 4;
/** How far shortage and plenty can bend the personality's shares. */
const NEED_BEND = { min: 0.25, max: 4 } as const;
/** Serfs moved at once from a resource it has plenty of to one it is short of. */
const MOVED = 2;

/** The serfs it recruits up to, by personality and difficulty. */
export const serfTarget = ({ personality, difficulty }: ManagerInput) =>
  Math.min(Math.round(personality.serfs * difficulty.serfShare), UNITS.serf.maxPerPlayer);

/** Recruits a serf while it has fewer than it wants and can house and pay one. */
function recruit(input: ManagerInput): AiProposal | null {
  const { townHall, units, population, buildings } = input.knowledge;
  if (!townHall) return null;
  const serfs = units.filter((u) => u.type === 'serf').length;
  const target = serfTarget(input);
  if (serfs >= target) return null;
  // Miners eat: with a mine, it keeps some food back for them.
  const reserve = buildings.some((b) => depositOf(b.type) !== undefined)
    ? AI_RULES.mineFoodReserve
    : 0;
  const food = (UNITS.serf.cost as ResourceCost).food ?? 0;
  if (!hasFreeHousing(population) || !affords(input.budget, UNITS.serf.cost)) return null;
  if (input.budget.food - food < reserve) return null;
  spend(input.budget, UNITS.serf.cost);
  return {
    command: { type: 'recruitSerf', buildingId: townHall.id },
    note: `recruit serf ${serfs + 1}/${target}`,
  };
}

/** The stock it wants of each gathered resource: its reserve and its next building. */
function wantedStock({ personality, memory }: ManagerInput): Record<GatheredResource, number> {
  const cost: ResourceCost = memory.goal ? BUILDINGS[memory.goal.building].cost : {};
  return {
    wood: personality.reserve.wood + (cost.wood ?? 0),
    stone: personality.reserve.stone + (cost.stone ?? 0),
  };
}

/** Where a serf could gather: the home ground, or farther out once that is used up. */
function choicesFor(input: ManagerInput, resource: GatheredResource): Decoration[] {
  const { knowledge, memory } = input;
  const hall = knowledge.townHall;
  if (!hall) return [];
  const safe = (node: Decoration) => !isUnsafe(memory, knowledge.deposits, node);
  const near = knowledge.nodesAround(NODE_OF[resource], hall, HOME_RADIUS, NODE_CHOICES, safe);
  return near.length > 0
    ? near
    : knowledge.nodesAround(NODE_OF[resource], hall, AI_RULES.farGatherRadius, NODE_CHOICES, safe);
}

/**
 * Puts idle serfs to work, each on the resource furthest below its share of the gatherers
 * (the personality's shares, bent toward what is short), and moves a few over when it has
 * plenty of one resource and too little of another. One order per resource.
 */
function gather(input: ManagerInput): AiProposal[] {
  const { knowledge, personality, rng, claimed } = input;
  const serfs = knowledge.units.filter((u) => u.type === 'serf' && !claimed.has(u.id));
  const working: Record<GatheredResource, UnitInstance[]> = { wood: [], stone: [] };
  for (const unit of serfs) {
    if (unit.task.kind !== 'gather') continue;
    const kind = knowledge.nodeKind(unit.task.nodeId);
    const resource = GATHERED.find((r) => NODE_OF[r] === kind);
    if (resource) working[resource].push(unit);
  }
  const idle = serfs.filter((u) => u.task.kind === 'idle' && !u.movement);

  const wanted = wantedStock(input);
  const short = GATHERED.find((r) => knowledge.stock[r] < wanted[r]);
  const plenty = GATHERED.find(
    (r) => knowledge.stock[r] > wanted[r] * AI_RULES.surplusFactor && working[r].length > 1,
  );
  const moving = idle.length === 0 && short !== undefined && plenty !== undefined;
  if (idle.length === 0 && !moving) return [];

  const choices: Record<GatheredResource, Decoration[]> = {
    wood: choicesFor(input, 'wood'),
    stone: choicesFor(input, 'stone'),
  };
  const sent: Record<GatheredResource, EntityId[]> = { wood: [], stone: [] };
  if (moving && choices[short].length > 0) {
    const movers = working[plenty].slice(0, Math.min(MOVED, working[plenty].length - 1));
    sent[short].push(...movers.map((u) => u.id));
  }
  const available = GATHERED.filter((r) => personality.gather[r] > 0 && choices[r].length > 0);
  const share = (r: GatheredResource) =>
    personality.gather[r] *
    clamp(wanted[r] / (knowledge.stock[r] + 1), NEED_BEND.min, NEED_BEND.max);
  for (const serf of available.length > 0 ? idle : []) {
    const filled = (r: GatheredResource) => (working[r].length + sent[r].length) / share(r);
    // Ties go to the first listed, so the choice is the same everywhere.
    const resource = available.reduce((best, r) => (filled(r) < filled(best) ? r : best));
    sent[resource].push(serf.id);
  }
  return GATHERED.flatMap((resource): AiProposal[] => {
    const unitIds = sent[resource];
    const node = choices[resource][Math.floor(rng() * choices[resource].length)];
    if (unitIds.length === 0 || !node) return [];
    for (const id of unitIds) claimed.add(id);
    return [
      {
        command: { type: 'gather', unitIds, nodeId: node.id },
        note: `${unitIds.length} serf(s) gather ${resource}`,
      },
    ];
  });
}

/** The economy manager's proposals, most important first. */
export function manageEconomy(input: ManagerInput): AiProposal[] {
  const recruited = recruit(input);
  return [...(recruited ? [recruited] : []), ...gather(input)];
}
