import { AI_RULES, depositOf, productionOf, type BuildingId } from '@roe/game-data';
import type { Decoration, DecorationKind, Vec2 } from '@roe/shared';
import type { SpotOptions, SpotSearch } from './buildingSpot.js';
import { depositAt } from './deposits.js';
import type { ManagerInput } from './manager.js';
import { isUnsafe } from './memory.js';

/** How far from its starting point a search for an ordinary building goes. */
const SEARCH_RADIUS = 45;
/** A harvesting building wants this many nodes within most of its work radius. */
const MIN_NODES: Readonly<Record<DecorationKind, number>> = { tree: 12, rock: 3 };
const WORK_SHARE = 0.8;
/** Nodes this close to one another count as one patch. */
const PATCH_RADIUS = 10;
/** The most nodes looked at when choosing a patch. */
const PATCH_NODES = 120;
/** How far from the middle of a patch the search goes. */
const PATCH_SEARCH = 18;

const within = (a: Vec2, b: Vec2, radius: number) =>
  (a.x - b.x) ** 2 + (a.z - b.z) ** 2 <= radius * radius;

const safe = ({ memory, knowledge }: ManagerInput) => {
  return (point: Vec2) => !isUnsafe(memory, knowledge.deposits, point);
};

/** The safe, reachable trees or rocks of its surroundings. */
function safeNodes(input: ManagerInput, kind: DecorationKind): Decoration[] {
  const { knowledge } = input;
  if (!knowledge.townHall) return [];
  const radius = AI_RULES.farGatherRadius;
  return knowledge.nodesAround(kind, knowledge.townHall, radius, PATCH_NODES, safe(input));
}

/** The node with the most others around it (the first of equals): the best patch. */
function richest(nodes: readonly Decoration[]): Decoration | null {
  let best: Decoration | null = null;
  let most = 0;
  for (const node of nodes) {
    const count = nodes.filter((other) => within(node, other, PATCH_RADIUS)).length;
    if (count > most) {
      best = node;
      most = count;
    }
  }
  return best;
}

/**
 * One decision's share (from candidate `from`) of the search for where it would put
 * `building` now: mines on a deposit it has seen unguarded;
 * lumbermills and quarries by the best patch of trees or rocks; fields by the mill; a
 * storehouse by the rocks it gathers; everything else around the Town Hall. Never near
 * where it saw enemies, or by a deposit it hasn't seen unguarded.
 */
export function siteFor(input: ManagerInput, building: BuildingId, from: number): SpotSearch {
  const { knowledge, findSpot } = input;
  const hall = knowledge.townHall;
  if (!hall) return { kind: 'none' };
  const isSafe = safe(input);

  if (depositOf(building)) {
    const options: SpotOptions = {
      near: hall,
      radius: AI_RULES.farGatherRadius,
      accept: (spot) => {
        const index = depositAt(knowledge.deposits, spot);
        return input.memory.deposits[index] === 'clear' && isSafe(spot);
      },
    };
    return findSpot(building, options, from);
  }
  const production = productionOf(building);
  if (production?.kind === 'harvest') {
    const nodes = safeNodes(input, production.node);
    const patch = richest(nodes);
    if (!patch) return { kind: 'none' };
    const reach = production.workRadius * WORK_SHARE;
    const options: SpotOptions = {
      near: patch,
      radius: PATCH_SEARCH,
      accept: (spot) =>
        isSafe(spot) &&
        nodes.filter((node) => within(spot, node, reach)).length >= MIN_NODES[production.node],
    };
    return findSpot(building, options, from);
  }
  let near: Vec2 = hall;
  if (production?.kind === 'farm') {
    near = knowledge.buildings.find((b) => b.type === 'mill') ?? hall;
  } else if (building === 'storehouse') {
    near =
      knowledge.buildings.find((b) => b.type === 'quarry') ??
      richest(safeNodes(input, 'rock')) ??
      hall;
  }
  return findSpot(building, { near, radius: SEARCH_RADIUS, accept: isSafe }, from);
}
