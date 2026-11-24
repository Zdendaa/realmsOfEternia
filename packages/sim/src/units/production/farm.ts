import type { FarmProduction } from '@roe/game-data';
import { SIMULATION_TICK_RATE } from '@roe/shared';
import { setField, type EconomyDraft } from '../../economy/draft.js';
import {
  FIELD_RULES,
  fieldOf,
  FRESH_FIELD,
  isRipe,
  plotCount,
  plotWorkPoint,
} from '../../state/fields.js';
import type { BuildingInstance } from '../../state/gameState.js';
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

const ticks = (seconds: number) => Math.round(seconds * SIMULATION_TICK_RATE);

function goToPlot(unit: UnitInstance, task: WorkTask, building: BuildingInstance, plot: number) {
  setPhase(unit, task, 'toPlot', plot);
  unit.movement = moveTo(plotWorkPoint(building, plot));
}

/** Waits for the crop at the field, walking to its entrance first if far from it. */
function waitAtField(unit: UnitInstance, task: WorkTask, building: BuildingInstance, walk = false) {
  setPhase(unit, task, 'waiting', -1);
  unit.movement = walk || !isNear(building, unit) ? moveTo(workerDoor(building)) : null;
}

/**
 * Picks the farmer's next step from the field's state: deliver what's carried, sow or
 * harvest the next plot, start the harvest once the crop is ripe, or wait for it.
 */
function nextStep(
  unit: UnitInstance,
  task: WorkTask,
  building: BuildingInstance,
  tick: number,
  buildings: readonly BuildingInstance[],
  economy: EconomyDraft,
): void {
  if (unit.carrying) return goToStorage(unit, task, buildings);
  const field = fieldOf(economy.fields, building.id);
  if (field.phase === 'growing') {
    if (!isRipe(field, tick)) return waitAtField(unit, task, building);
    setField(economy, building.id, { phase: 'harvesting', plotsDone: 0, ripeAt: field.ripeAt });
    return goToPlot(unit, task, building, 0);
  }
  goToPlot(unit, task, building, field.plotsDone);
}

/**
 * One tick of a farmer: sow the field plot by plot (walking to each), wait while the crop
 * grows, then harvest plot by plot, carrying each plot's crop to storage, and sow again.
 * The field's progress lives in `GameState.fields`, so a farmer only remembers which plot
 * it is walking to (`target`) and the ticks of work on it. A plot that can't be reached
 * makes the farmer wait and try again.
 */
export function updateFarmer(
  unit: UnitInstance,
  task: WorkTask,
  building: BuildingInstance,
  production: FarmProduction,
  tick: number,
  buildings: readonly BuildingInstance[],
  economy: EconomyDraft,
): void {
  if (unit.movement) return;
  const field = fieldOf(economy.fields, building.id);
  const plots = plotCount(building.type);

  switch (task.phase) {
    case 'waiting': {
      if (isLookTick(tick, unit)) nextStep(unit, task, building, tick, buildings, economy);
      return;
    }
    case 'toPlot': {
      const working = field.phase === 'sowing' || field.phase === 'harvesting';
      if (!working || field.plotsDone !== task.target) {
        return nextStep(unit, task, building, tick, buildings, economy);
      }
      const at = plotWorkPoint(building, task.target);
      if (Math.hypot(unit.x - at.x, unit.z - at.z) > FIELD_RULES.reach) {
        setPhase(unit, task, 'waiting', -1); // unreachable for now
        return;
      }
      setPhase(unit, task, field.phase === 'sowing' ? 'sowing' : 'harvesting');
      return;
    }
    case 'sowing': {
      if (field.phase !== 'sowing' || field.plotsDone !== task.target) {
        return nextStep(unit, task, building, tick, buildings, economy);
      }
      const progress = task.progress + 1;
      if (progress < ticks(production.sowSeconds)) {
        unit.task = { ...task, progress };
        return;
      }
      const done = field.plotsDone + 1;
      if (done < plots) {
        setField(economy, building.id, { ...field, plotsDone: done });
        return goToPlot(unit, task, building, done);
      }
      // Every plot is sown: the crop grows while the farmer waits at the field's edge.
      setField(economy, building.id, {
        phase: 'growing',
        plotsDone: 0,
        ripeAt: tick + ticks(production.growSeconds),
      });
      waitAtField(unit, task, building, true);
      return;
    }
    case 'harvesting': {
      if (field.phase !== 'harvesting' || field.plotsDone !== task.target) {
        return nextStep(unit, task, building, tick, buildings, economy);
      }
      const progress = task.progress + 1;
      if (progress < ticks(production.harvestSeconds)) {
        unit.task = { ...task, progress };
        return;
      }
      const done = field.plotsDone + 1;
      // After the last plot the field is bare again, ready for sowing.
      setField(economy, building.id, done < plots ? { ...field, plotsDone: done } : FRESH_FIELD);
      unit.carrying = { resource: production.crop, amount: 1 };
      goToStorage(unit, task, buildings);
      return;
    }
    case 'toStorage': {
      if (depositAtStorage(unit, task, buildings, economy)) {
        nextStep(unit, task, building, tick, buildings, economy);
      }
      return;
    }
    default:
      // Not a farming phase (can't happen for a field): start over.
      setPhase(unit, task, 'waiting', -1);
  }
}
