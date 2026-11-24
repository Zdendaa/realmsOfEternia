import { GATHER_RULES, RESOURCE_NODES, STORAGE_BUILDINGS } from '@roe/game-data';
import {
  distanceToFootprint,
  entrancePoint,
  SIMULATION_TICK_RATE,
  type Decoration,
  type PlayerId,
  type Vec2,
} from '@roe/shared';
import { deposit, remaining, take, type EconomyDraft } from '../economy/draft.js';
import { toPlacedFootprint, type BuildingInstance } from '../state/gameState.js';
import { findNearestNode, gatherReach, nodeById } from '../state/resourceNodes.js';
import { IDLE, type GatherPhase, type UnitInstance, type UnitTask } from '../state/units.js';
import { moveTo } from './orders.js';

export const STORAGE_RULES = {
  /** A carrier counts as at a storage within this distance of its footprint. */
  depositReach: 3,
  /** Carriers walk to this point in front of the storage's entrance. */
  entranceOffset: 1.5,
} as const;

const isStorageType = (type: BuildingInstance['type']) =>
  (STORAGE_BUILDINGS as readonly string[]).includes(type);

/** The owner's nearest complete storage building (ties by id), or null. */
export function nearestStorage(
  buildings: readonly BuildingInstance[],
  owner: PlayerId | null,
  from: Vec2,
): BuildingInstance | null {
  let best: BuildingInstance | null = null;
  let bestDistance = Infinity;
  for (const b of buildings) {
    if (b.ownerId !== owner || b.status !== 'complete' || !isStorageType(b.type)) continue;
    const distance = distanceToFootprint(toPlacedFootprint(b), from.x, from.z);
    if (distance < bestDistance) {
      best = b;
      bestDistance = distance;
    }
  }
  return best;
}

/** The point in front of a storage's entrance where carriers deliver. */
export const storageDoor = (storage: BuildingInstance) =>
  entrancePoint(toPlacedFootprint(storage), STORAGE_RULES.entranceOffset);

const gatherTask = (nodeId: number, phase: GatherPhase): UnitTask => ({
  kind: 'gather',
  nodeId,
  phase,
  progress: 0,
});

/** Starts (or restarts) the gather loop at `node`: walk there, or deliver other goods first. */
export function startGathering(unit: UnitInstance, node: Decoration): Partial<UnitInstance> {
  const resource = RESOURCE_NODES[node.kind].resource;
  if (
    unit.carrying &&
    (unit.carrying.resource !== resource || unit.carrying.siteId !== undefined)
  ) {
    // Other goods in hand (or material reserved for a site): hand them in first, so the
    // harvest never mixes with them (phase toStorage picks the storage).
    return { task: gatherTask(node.id, 'toStorage'), movement: null };
  }
  return { task: gatherTask(node.id, 'toNode'), movement: moveTo(node) };
}

/** Next node of the same kind near the finished one, else deliver what's carried, else idle. */
function moveOn(unit: UnitInstance, node: Decoration, economy: EconomyDraft): void {
  const next = findNearestNode(
    economy.world,
    economy.nodes,
    node.kind,
    node,
    GATHER_RULES.nextNodeRadius,
    node.id,
  );
  if (unit.carrying) {
    unit.task = gatherTask(next?.id ?? node.id, 'toStorage');
    unit.movement = null;
  } else if (next) {
    Object.assign(unit, startGathering(unit, next));
  } else {
    unit.task = IDLE;
  }
}

/**
 * One tick of the gather loop (walk to the node → work → carry to storage → deposit →
 * back), mutating the unit's working copy and the economy draft. Units of one tick are
 * processed in state order, so two gatherers racing for the last unit of a node always
 * resolve the same way.
 */
export function updateGatherer(
  unit: UnitInstance,
  buildings: readonly BuildingInstance[],
  economy: EconomyDraft,
): void {
  const task = unit.task;
  if (task.kind !== 'gather') return;
  const node = nodeById(economy.world, task.nodeId);
  if (!node) {
    unit.task = IDLE;
    return;
  }
  const rule = RESOURCE_NODES[node.kind];

  switch (task.phase) {
    case 'toNode': {
      if (remaining(economy, node.id) <= 0) return moveOn(unit, node, economy);
      if (unit.movement) return;
      const distance = Math.hypot(unit.x - node.x, unit.z - node.z);
      // Arrived next to it, or the route ended as close as the ground allows.
      unit.task = distance <= gatherReach(node) ? { ...task, phase: 'working', progress: 0 } : IDLE;
      return;
    }
    case 'working': {
      if (remaining(economy, node.id) <= 0) return moveOn(unit, node, economy);
      const progress = task.progress + 1;
      if (progress < rule.workSeconds * SIMULATION_TICK_RATE) {
        unit.task = { ...task, progress };
        return;
      }
      take(economy, node.id);
      unit.carrying = {
        resource: rule.resource,
        amount: (unit.carrying?.amount ?? 0) + 1,
      };
      const full = unit.carrying.amount >= GATHER_RULES.carryCapacity;
      unit.task =
        full || remaining(economy, node.id) <= 0
          ? { ...task, phase: 'toStorage', progress: 0 }
          : { ...task, progress: 0 };
      return;
    }
    case 'toStorage': {
      if (!unit.carrying) {
        Object.assign(unit, startGathering(unit, node));
        return;
      }
      const storage = nearestStorage(buildings, unit.ownerId, unit);
      if (!storage) {
        unit.task = IDLE; // nowhere to deliver: keep the goods
        return;
      }
      if (unit.movement) return;
      const reach = distanceToFootprint(toPlacedFootprint(storage), unit.x, unit.z);
      if (reach > STORAGE_RULES.depositReach) {
        // In this phase `progress` counts walks to the door: one, then give up (keeping
        // the goods) if the route ended short of it.
        if (task.progress > 0) {
          unit.task = IDLE;
          return;
        }
        unit.task = { ...task, progress: 1 };
        unit.movement = moveTo(storageDoor(storage));
        return;
      }
      if (unit.ownerId !== null) deposit(economy, unit.ownerId, unit.carrying);
      unit.carrying = null;
      if (remaining(economy, node.id) > 0) Object.assign(unit, startGathering(unit, node));
      else moveOn(unit, node, economy);
      return;
    }
  }
}
