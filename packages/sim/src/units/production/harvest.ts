import { RESOURCE_NODES, type HarvestProduction } from '@roe/game-data';
import { SIMULATION_TICK_RATE } from '@roe/shared';
import { remaining, take, type EconomyDraft } from '../../economy/draft.js';
import type { BuildingInstance } from '../../state/gameState.js';
import { gatherReach, nodeById, nodesNear } from '../../state/resourceNodes.js';
import type { UnitInstance, WorkTask } from '../../state/units.js';
import { moveTo } from '../orders.js';
import {
  depositAtStorage,
  goToStorage,
  isLookTick,
  isNear,
  setPhase,
  workerDoor,
} from './common.js';

/** Walks to the node nearest the building with something left, or waits. */
function goToNextNode(
  unit: UnitInstance,
  task: WorkTask,
  building: BuildingInstance,
  production: HarvestProduction,
  economy: EconomyDraft,
) {
  const node = nodesNear(
    economy.world,
    economy.nodes,
    production.node,
    building,
    production.workRadius,
  )[0];
  if (!node) {
    setPhase(unit, task, 'waiting', -1);
    unit.movement = null;
    return;
  }
  setPhase(unit, task, 'toNode', node.id);
  unit.movement = moveTo(node);
}

/**
 * One tick of a harvesting worker (lumbermill, quarry): harvest the node nearest its
 * building → back to the building → process → storage → deposit → next node. Each phase
 * starts walking right away; a route that ends short of its target falls back (a missed
 * node or storage means waiting and trying again later, a missed building skips
 * processing).
 */
export function updateHarvester(
  unit: UnitInstance,
  task: WorkTask,
  building: BuildingInstance,
  production: HarvestProduction,
  tick: number,
  buildings: readonly BuildingInstance[],
  economy: EconomyDraft,
): void {
  if (unit.movement) {
    // Someone else took the last unit while we were on our way: pick another node.
    if (task.phase === 'toNode' && remaining(economy, task.target) <= 0) {
      goToNextNode(unit, task, building, production, economy);
    }
    return;
  }

  switch (task.phase) {
    case 'waiting': {
      if (!isLookTick(tick, unit)) return;
      if (unit.carrying) goToStorage(unit, task, buildings);
      else goToNextNode(unit, task, building, production, economy);
      return;
    }
    case 'toNode': {
      const node = nodeById(economy.world, task.target);
      if (!node || remaining(economy, node.id) <= 0)
        return goToNextNode(unit, task, building, production, economy);
      if (Math.hypot(unit.x - node.x, unit.z - node.z) <= gatherReach(node)) {
        setPhase(unit, task, 'working');
      } else {
        setPhase(unit, task, 'waiting', -1); // unreachable for now
      }
      return;
    }
    case 'working': {
      const node = nodeById(economy.world, task.target);
      if (!node || remaining(economy, node.id) <= 0)
        return goToNextNode(unit, task, building, production, economy);
      const rule = RESOURCE_NODES[node.kind];
      const progress = task.progress + 1;
      if (progress < rule.workSeconds * SIMULATION_TICK_RATE) {
        unit.task = { ...task, progress };
        return;
      }
      take(economy, node.id);
      unit.carrying = { resource: rule.resource, amount: 1 };
      setPhase(unit, task, 'toBuilding');
      unit.movement = moveTo(workerDoor(building));
      return;
    }
    case 'toBuilding': {
      if (isNear(building, unit)) setPhase(unit, task, 'processing');
      else goToStorage(unit, task, buildings);
      return;
    }
    case 'processing': {
      const progress = task.progress + 1;
      if (progress < production.processSeconds * SIMULATION_TICK_RATE) {
        unit.task = { ...task, progress };
        return;
      }
      goToStorage(unit, task, buildings);
      return;
    }
    case 'toStorage': {
      if (depositAtStorage(unit, task, buildings, economy)) {
        goToNextNode(unit, task, building, production, economy);
      }
      return;
    }
    default:
      // Not a harvesting phase (can't happen for this building): start over.
      setPhase(unit, task, 'waiting', -1);
  }
}
