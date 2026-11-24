import { RESOURCE_NODES } from '@roe/game-data';
import { isInPlayableArea, type Decoration, type DecorationKind, type Vec2 } from '@roe/shared';
import { NAV_RULES } from '../nav/navGrid.js';
import { PLACEMENT_RULES } from '../rules/placement.js';
import type { SimWorld } from '../world/createWorld.js';
import type { GameState } from './gameState.js';

/** Remaining amounts by decoration id (sparse: absent = untouched). */
export type NodeAmounts = Readonly<Record<number, number>>;

/** Full amount of a tree or rock, from its size. */
export function initialAmount(node: Decoration): number {
  const rule = RESOURCE_NODES[node.kind];
  const amount = Math.round(rule.amountPerScale * node.scale);
  return Math.min(rule.maxAmount, Math.max(rule.minAmount, amount));
}

/** Trees and rocks inside the playable area are resources; the border forest is scenery. */
export const isHarvestable = (world: SimWorld, node: Decoration) =>
  isInPlayableArea(world.map, node.x, node.z);

/** The decoration with id `id`, if any (ids are indices into `world.decorations`). */
export const nodeById = (world: SimWorld, id: number): Decoration | undefined =>
  world.decorations[id];

/** What is left of node `id`: 0 for depleted, unknown or non-harvestable nodes. */
export function remainingAmount(world: SimWorld, nodes: NodeAmounts, id: number): number {
  const node = nodeById(world, id);
  if (!node || !isHarvestable(world, node)) return 0;
  return nodes[id] ?? initialAmount(node);
}

/** True once a node has been harvested completely (it no longer blocks anything). */
export const isDepleted = (state: Pick<GameState, 'resourceNodes'>, id: number) =>
  state.resourceNodes[id] === 0;

/** Blocking radius of a tree or rock (placement and nav use the same circle). */
export const nodeRadius = (node: Decoration) =>
  (node.kind === 'tree' ? PLACEMENT_RULES.treeRadius : PLACEMENT_RULES.rockRadius) * node.scale;

/**
 * A gatherer counts as at the node within this distance of its center: the blocked
 * circle around it plus about one nav cell (the nearest walkable cell's center).
 */
export const gatherReach = (node: Decoration) =>
  nodeRadius(node) + NAV_RULES.clearance + NAV_RULES.cellSize * 1.2;

/**
 * Harvestable nodes of `kind` with something left within `radius` of `near`, nearest
 * first (ties by id, so the order is deterministic).
 */
export function nodesNear(
  world: SimWorld,
  nodes: NodeAmounts,
  kind: DecorationKind,
  near: Vec2,
  radius: number,
): Decoration[] {
  const found: { node: Decoration; distance: number }[] = [];
  const candidates = world.obstacleIndex.query({
    minX: near.x - radius,
    maxX: near.x + radius,
    minZ: near.z - radius,
    maxZ: near.z + radius,
  });
  for (const node of candidates) {
    if (node.kind !== kind) continue;
    const distance = (node.x - near.x) ** 2 + (node.z - near.z) ** 2;
    if (distance > radius * radius || remainingAmount(world, nodes, node.id) <= 0) continue;
    found.push({ node, distance });
  }
  found.sort((a, b) => a.distance - b.distance || a.node.id - b.node.id);
  return found.map((f) => f.node);
}

/** The nearest such node other than `exclude`, or null. */
export function findNearestNode(
  world: SimWorld,
  nodes: NodeAmounts,
  kind: DecorationKind,
  near: Vec2,
  radius: number,
  exclude?: number,
): Decoration | null {
  return nodesNear(world, nodes, kind, near, radius).find((n) => n.id !== exclude) ?? null;
}
