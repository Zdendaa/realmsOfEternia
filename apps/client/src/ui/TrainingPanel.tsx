import {
  trainsOf,
  UNITS,
  type BuildingId,
  type UnitDefinition,
  type UnitKind,
} from '@roe/game-data';
import {
  EMPTY_STOCK,
  missingResources,
  populationOf,
  TRAINING_QUEUE_LIMIT,
  trainingProgress,
  type CommandIssue,
} from '@roe/sim';
import { useState } from 'react';
import { LOCAL_PLAYER, useGameStore } from '../state/gameStore';
import { CostList } from './CostList';

/** Steps of the progress bar (the panel re-renders once per step, not per tick). */
const PROGRESS_STEPS = 40;

const ISSUE_MESSAGES: Partial<Record<CommandIssue, string>> = {
  queueFull: `At most ${TRAINING_QUEUE_LIMIT} in the queue.`,
  notEnoughResources: 'Not enough resources.',
  underConstruction: 'The building is not finished yet.',
};

/**
 * The selected building's training queue as one string ("swordsman|spearman;12;wait"):
 * units, progress step of the first, and whether it waits for housing. A primitive, so
 * the panel re-renders only when one of them changes.
 */
function useQueueSummary(buildingId: number) {
  return useGameStore((s) => {
    const queue = s.state.training[buildingId];
    if (!queue) return '';
    const progress = trainingProgress(queue, s.state.tick);
    const step = progress ? Math.floor((progress.done / progress.total) * PROGRESS_STEPS) : 0;
    const { used, capacity } = populationOf(s.state, LOCAL_PLAYER);
    const waiting = s.state.tick >= queue.readyAt && used >= capacity;
    return `${queue.queue.join('|')};${step};${waiting ? 'wait' : ''}`;
  });
}

/**
 * Training at the player's own barracks or archery range: a button per unit it trains
 * (cost, time; disabled when the queue is full or the stock can't pay), and the queue
 * with the first unit's progress. Clicking a queued unit cancels it (refunded).
 */
export function TrainingPanel({ buildingId, type }: { buildingId: number; type: BuildingId }) {
  const dispatch = useGameStore((s) => s.dispatch);
  const stock = useGameStore((s) => s.state.stocks[LOCAL_PLAYER] ?? EMPTY_STOCK);
  const summary = useQueueSummary(buildingId);
  const [rejected, setRejected] = useState<CommandIssue | null>(null);

  const [units = '', step = '0', waiting = ''] = summary.split(';');
  const queue = units ? (units.split('|') as UnitKind[]) : [];
  const full = queue.length >= TRAINING_QUEUE_LIMIT;

  const train = (unit: UnitKind) => {
    const check = dispatch({ type: 'trainUnit', buildingId, unit });
    setRejected(check.ok ? null : (check.issues[0] ?? null));
  };
  const cancel = (index: number) => {
    dispatch({ type: 'cancelTraining', buildingId, index });
    setRejected(null);
  };

  return (
    <div className="training">
      <p className="selection-meta">Train</p>
      {trainsOf(type).map((unit) => {
        const definition: UnitDefinition = UNITS[unit];
        const short = missingResources(stock, definition.cost).length > 0;
        return (
          <div key={unit} className="selection-action-row">
            <button
              type="button"
              className="selection-action"
              onClick={() => train(unit)}
              disabled={full || short}
              title={`Train a ${definition.name.toLowerCase()}: ${definition.description}`}
            >
              {definition.name}
            </button>
            <CostList cost={definition.cost} stock={stock} />
            <span className="training-time">{definition.trainTime ?? 0} s</span>
          </div>
        );
      })}
      {queue.length > 0 && (
        <ol className="training-queue" aria-label="Training queue">
          {queue.map((unit, index) => (
            <li key={`${index}-${unit}`}>
              <button
                type="button"
                onClick={() => cancel(index)}
                title={`Cancel ${UNITS[unit].name.toLowerCase()} (refunded)`}
              >
                {UNITS[unit].name}
                {index === 0 && (
                  <span
                    className="training-progress"
                    style={{ width: `${(Number(step) / PROGRESS_STEPS) * 100}%` }}
                  />
                )}
              </button>
            </li>
          ))}
        </ol>
      )}
      {waiting && <p className="selection-issue">Waiting for housing: build a house.</p>}
      {rejected && <p className="selection-issue">{ISSUE_MESSAGES[rejected] ?? rejected}</p>}
    </div>
  );
}
