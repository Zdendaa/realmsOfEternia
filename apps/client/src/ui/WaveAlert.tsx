import { SIMULATION_TICK_RATE, type WaveDefinition } from '@roe/shared';
import { waveTick } from '@roe/sim';
import { useGameStore } from '../state/gameStore';

/** How long the "they are coming" banner stays (seconds). */
const BANNER_SECONDS = 8;
/** The countdown shows during the last minute before a wave. */
const COUNTDOWN_SECONDS = 60;
/** Stable, so the selector returns the same array on maps without waves. */
const NO_WAVES: readonly WaveDefinition[] = [];

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

/**
 * Warns about scripted waves: a countdown during the last minute before the next one,
 * then a banner when it sets out. Selects only whole seconds, so it re-renders at most
 * once per second.
 */
export function WaveAlert() {
  const waves = useGameStore((s) => s.world.map.waves ?? NO_WAVES);
  const wavesSent = useGameStore((s) => s.state.wavesSent);
  const lastWaveAt = useGameStore((s) => s.state.lastWaveAt);
  const second = useGameStore((s) => Math.floor(s.state.tick / SIMULATION_TICK_RATE));

  if (lastWaveAt !== null && second - lastWaveAt / SIMULATION_TICK_RATE < BANNER_SECONDS) {
    return (
      <div className="hud-panel wave-alert is-attack" role="alert">
        Skeletons are marching on your village!
      </div>
    );
  }
  const next = waves[wavesSent];
  if (!next) return null;
  const left = waveTick(next) / SIMULATION_TICK_RATE - second;
  if (left > COUNTDOWN_SECONDS || left < 0) return null;
  return <div className="hud-panel wave-alert">Skeletons attack in {clock(left)}</div>;
}
