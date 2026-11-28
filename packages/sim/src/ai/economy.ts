import { UNITS, type AiPersonalityDefinition, type GatheredResource } from '@roe/game-data';
import type { DecorationKind, EntityId, Rng } from '@roe/shared';
import type { Command } from '../commands/types.js';
import { hasFreeHousing } from '../economy/population.js';
import { canAfford } from '../economy/stock.js';
import type { AiKnowledge } from './knowledge.js';

/** A command a manager wants given, with a few words on why. */
export interface AiProposal {
  command: Command;
  note: string;
}

/** What a manager decides from. */
export interface ManagerInput {
  knowledge: AiKnowledge;
  personality: AiPersonalityDefinition;
  rng: Rng;
}

const NODE_OF: Readonly<Record<GatheredResource, DecorationKind>> = {
  wood: 'tree',
  stone: 'rock',
};
const GATHERED = Object.keys(NODE_OF) as GatheredResource[];
/** A group is sent to one of this many nearest nodes (it spreads out from there). */
const NODE_CHOICES = 4;

/** Recruits a serf while it has fewer than its personality wants and can house and pay one. */
function recruit({ knowledge, personality }: ManagerInput): AiProposal | null {
  const { townHall, units, population, stock } = knowledge;
  if (!townHall) return null;
  const serfs = units.filter((u) => u.type === 'serf').length;
  if (serfs >= Math.min(personality.serfs, UNITS.serf.maxPerPlayer)) return null;
  if (!hasFreeHousing(population) || !canAfford(stock, UNITS.serf.cost)) return null;
  return {
    command: { type: 'recruitSerf', buildingId: townHall.id },
    note: `recruit serf ${serfs + 1}/${personality.serfs}`,
  };
}

/**
 * Puts idle serfs to work: each goes to the resource that is furthest below its share of
 * the gatherers, and each resource's new gatherers get one order.
 */
function gather({ knowledge, personality, rng }: ManagerInput): AiProposal[] {
  const idle = knowledge.units.filter(
    (u) => u.type === 'serf' && u.task.kind === 'idle' && !u.movement,
  );
  if (idle.length === 0) return [];
  const working: Record<GatheredResource, number> = { wood: 0, stone: 0 };
  for (const unit of knowledge.units) {
    if (unit.task.kind !== 'gather') continue;
    const kind = knowledge.nodeKind(unit.task.nodeId);
    const resource = GATHERED.find((r) => NODE_OF[r] === kind);
    if (resource) working[resource]++;
  }
  const nodes = Object.fromEntries(
    GATHERED.map((r) => [r, knowledge.homeNodes(NODE_OF[r], NODE_CHOICES)]),
  ) as Record<GatheredResource, ReturnType<AiKnowledge['homeNodes']>>;
  const wanted = GATHERED.filter((r) => personality.gather[r] > 0 && nodes[r].length > 0);
  if (wanted.length === 0) return [];

  const sent: Record<GatheredResource, EntityId[]> = { wood: [], stone: [] };
  for (const serf of idle) {
    const filled = (r: GatheredResource) => (working[r] + sent[r].length) / personality.gather[r];
    // Ties go to the first listed, so the choice is the same everywhere.
    const resource = wanted.reduce((best, r) => (filled(r) < filled(best) ? r : best));
    sent[resource].push(serf.id);
  }
  return wanted.flatMap((resource): AiProposal[] => {
    const unitIds = sent[resource];
    const choices = nodes[resource];
    const node = choices[Math.floor(rng() * choices.length)];
    if (unitIds.length === 0 || !node) return [];
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
