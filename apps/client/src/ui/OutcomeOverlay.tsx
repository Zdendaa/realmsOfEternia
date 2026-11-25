import { SIMULATION_TICK_RATE } from '@roe/shared';
import { EMPTY_STATS } from '@roe/sim';
import { useState } from 'react';
import { LOCAL_PLAYER, useGameStore } from '../state/gameStore';

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

/**
 * The end of the game for the local player: Victory (camps and wave beaten) or Defeat
 * (Town Hall lost), with the time and a few numbers. "Continue watching" closes it (the
 * game goes on, but orders are refused); "New game" reloads the page for now.
 */
export function OutcomeOverlay() {
  const outcome = useGameStore((s) => s.state.outcome[LOCAL_PLAYER]);
  const [dismissed, setDismissed] = useState(false);
  // Read once the game is decided; these don't change the panel afterwards.
  const stats = useGameStore((s) => (outcome ? s.state.stats[LOCAL_PLAYER] : undefined));
  if (!outcome) return null;
  const won = outcome.result === 'won';
  if (dismissed) {
    return <div className="hud-panel outcome-badge">{won ? 'Victory' : 'Defeat'} · watching</div>;
  }
  const numbers = stats ?? EMPTY_STATS;
  return (
    <div className="outcome-backdrop" role="dialog" aria-label={won ? 'Victory' : 'Defeat'}>
      <section className={`hud-panel outcome-panel ${won ? 'is-won' : 'is-lost'}`}>
        <h2>{won ? 'Victory' : 'Defeat'}</h2>
        <p className="outcome-lead">
          {won
            ? 'The skeleton camps are cleared and the horde is beaten.'
            : 'Your Town Hall has fallen.'}
        </p>
        <dl className="unit-stats outcome-stats">
          <dt>Time</dt>
          <dd>{clock(outcome.at / SIMULATION_TICK_RATE)}</dd>
          <dt>Soldiers trained</dt>
          <dd>{numbers.soldiersTrained}</dd>
          <dt>Enemies killed</dt>
          <dd>{numbers.enemiesKilled}</dd>
          <dt>Buildings lost</dt>
          <dd>{numbers.buildingsLost}</dd>
        </dl>
        <div className="selection-action-row">
          <button type="button" className="selection-action" onClick={() => setDismissed(true)}>
            Continue watching
          </button>
          <button
            type="button"
            className="selection-action"
            onClick={() => window.location.reload()}
          >
            New game
          </button>
        </div>
      </section>
    </div>
  );
}
