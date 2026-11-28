import { AI_DIFFICULTIES, AI_PERSONALITIES, PLAYER_COLORS } from '@roe/game-data';
import { SIMULATION_TICK_RATE, type PlayerId } from '@roe/shared';
import { stockOf, type AiState, type GameState } from '@roe/sim';
import { cameraRig } from '../../render/camera/cameraRig';
import { useGameStore } from '../../state/gameStore';
import { seatOf } from '../../state/matchConfig';
import { useSettingsStore } from '../../state/settingsStore';

const clock = (tick: number) => {
  const seconds = Math.floor(tick / SIMULATION_TICK_RATE);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

/** Its serfs by what they are doing: gathering wood or stone, idle, or something else. */
function serfLine(state: GameState, player: PlayerId): string {
  const { world } = useGameStore.getState();
  const count = { wood: 0, stone: 0, idle: 0, other: 0 };
  for (const unit of state.units) {
    if (unit.ownerId !== player || unit.type !== 'serf') continue;
    if (unit.task.kind === 'gather') {
      const kind = world.decorations[unit.task.nodeId]?.kind;
      count[kind === 'rock' ? 'stone' : 'wood']++;
    } else if (unit.task.kind === 'idle') count.idle++;
    else count.other++;
  }
  return `Serfs: ${count.wood} wood, ${count.stone} stone, ${count.idle} idle, ${count.other} other`;
}

function AiEntry({ player, ai }: { player: PlayerId; ai: AiState }) {
  const watching = useSettingsStore((s) => s.watchSeat === player);
  const watch = useSettingsStore((s) => s.setWatchSeat);
  const { state } = useGameStore.getState();
  const stock = stockOf(state, player);
  const color = PLAYER_COLORS[seatOf(player)?.color ?? 'blue'].hex;
  const outcome = state.outcome[player];

  const toggle = () => {
    watch(watching ? null : player);
    const hall = state.buildings.find((b) => b.type === 'townHall' && b.ownerId === player);
    if (!watching && hall) cameraRig.current?.lookAt(hall.x, hall.z);
  };

  return (
    <article className="dev-ai-entry">
      <header>
        <span className="dev-ai-swatch" style={{ background: color }} />
        <strong>{player}</strong>
        <button type="button" aria-pressed={watching} onClick={toggle}>
          {watching ? 'Stop watching' : 'Watch'}
        </button>
      </header>
      <p>
        {AI_DIFFICULTIES[ai.difficulty].name} · {AI_PERSONALITIES[ai.personality].name} · team{' '}
        {state.teams[player]}
        {outcome ? ` · ${outcome.result}` : ''}
      </p>
      <p>
        Wood {stock.wood} · stone {stock.stone} · food {stock.food}
      </p>
      <p>{serfLine(state, player)}</p>
      <ol>
        {ai.log
          .slice(-4)
          .reverse()
          .map((decision, i) => (
            <li key={`${decision.tick}-${i}`} className={decision.refused ? 'is-refused' : ''}>
              {clock(decision.tick)} {decision.note}
              {decision.refused ? ` (refused: ${decision.refused.join(', ')})` : ''}
            </li>
          ))}
      </ol>
    </article>
  );
}

/**
 * Development only: what each computer player is doing, and a switch to see the map
 * through its fog of war. Reads the whole state (it is a debugging tool). Refreshed once
 * a game second; nothing in a match without computer players.
 */
export function AiInspector() {
  useGameStore((s) => Math.floor(s.state.tick / SIMULATION_TICK_RATE));
  // Also redrawn at once when watching changes.
  useSettingsStore((s) => s.watchSeat);
  const players = Object.entries(useGameStore.getState().state.ai);
  if (players.length === 0) return null;
  return (
    <details className="hud-panel dev-ai" aria-label="AI inspector">
      <summary>AI inspector ({players.length})</summary>
      {players.map(([player, ai]) => (
        <AiEntry key={player} player={player} ai={ai} />
      ))}
    </details>
  );
}
