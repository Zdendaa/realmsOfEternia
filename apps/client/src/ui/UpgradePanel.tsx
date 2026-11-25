import { BUILDINGS, upgradesOf, type BuildingId } from '@roe/game-data';
import { SIMULATION_TICK_RATE, type EntityId } from '@roe/shared';
import { EMPTY_STOCK, missingResources, type CommandIssue } from '@roe/sim';
import { useState } from 'react';
import { LOCAL_PLAYER, useGameStore } from '../state/gameStore';
import { CostList } from './CostList';

/** Steps of the progress bar (the panel re-renders once per step, not per tick). */
const PROGRESS_STEPS = 40;

const MESSAGES: Partial<Record<CommandIssue, string>> = {
  upgrading: 'The tower is already being upgraded.',
  notEnoughResources: 'Not enough resources.',
  gameOver: 'The game is over.',
};

/** The running upgrade as "type;step;seconds left", or an empty string. */
function useUpgradeSummary(buildingId: EntityId) {
  return useGameStore((s) => {
    const upgrade = s.state.upgrades[buildingId];
    if (!upgrade) return '';
    const total = upgrade.readyAt - upgrade.startedAt;
    const done = Math.min(total, s.state.tick - upgrade.startedAt);
    const left = Math.ceil((total - done) / SIMULATION_TICK_RATE);
    return `${upgrade.to};${Math.floor((done / total) * PROGRESS_STEPS)};${left}`;
  });
}

/**
 * Upgrading the player's own finished tower: a button per choice (cost, time and what it
 * does), or the running upgrade with its progress and a cancel button.
 */
export function UpgradePanel({ buildingId, type }: { buildingId: EntityId; type: BuildingId }) {
  const dispatch = useGameStore((s) => s.dispatch);
  const stock = useGameStore((s) => s.state.stocks[LOCAL_PLAYER] ?? EMPTY_STOCK);
  const summary = useUpgradeSummary(buildingId);
  const [rejected, setRejected] = useState<CommandIssue | null>(null);

  if (summary) {
    const [to = '', step = '0', left = '0'] = summary.split(';');
    return (
      <div className="training">
        <p className="selection-meta">
          Upgrading to {BUILDINGS[to as BuildingId].name}: {left} s. It doesn’t shoot meanwhile.
        </p>
        <div className="unit-health" aria-label="Upgrade progress">
          <span style={{ width: `${(Number(step) / PROGRESS_STEPS) * 100}%` }} />
        </div>
        <button
          type="button"
          className="selection-action"
          onClick={() => dispatch({ type: 'cancelUpgrade', buildingId })}
        >
          Cancel (refunded)
        </button>
      </div>
    );
  }

  const choices = upgradesOf(type);
  if (choices.length === 0) return null;
  return (
    <div className="training">
      <p className="selection-meta">Upgrade</p>
      {choices.map((to) => {
        const definition = BUILDINGS[to];
        return (
          <div key={to} className="upgrade-choice">
            <div className="selection-action-row">
              <button
                type="button"
                className="selection-action"
                disabled={missingResources(stock, definition.cost).length > 0}
                onClick={() => {
                  const check = dispatch({ type: 'upgradeTower', buildingId, to });
                  setRejected(check.ok ? null : (check.issues[0] ?? null));
                }}
              >
                {definition.name}
              </button>
              <CostList cost={definition.cost} stock={stock} />
              <span className="training-time">{definition.buildTime} s</span>
            </div>
            <p className="upgrade-description">{definition.description}</p>
          </div>
        );
      })}
      {rejected && <p className="selection-issue">{MESSAGES[rejected] ?? rejected}</p>}
    </div>
  );
}
