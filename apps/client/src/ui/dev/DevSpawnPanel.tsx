import { UNITS, type UnitKind } from '@roe/game-data';
import type { PlayerId } from '@roe/shared';
import { DEBUG_RESOURCES } from '@roe/sim';
import { useState } from 'react';
import { cameraFocus } from '../../render/camera/cameraFocus';
import { useGameStore } from '../../state/gameStore';
import { useSettingsStore } from '../../state/settingsStore';

/** The opponent the dev panel spawns for (any id other than the local player is hostile). */
const DEV_ENEMY: PlayerId = 'enemy';
const SOLDIERS: readonly UnitKind[] = ['swordsman', 'spearman', 'archer'];
const COUNT = 5;
/** Own units appear left of the camera focus, enemies to its right, facing each other. */
const SIDE_OFFSET = 8;

/**
 * Development only (mounted when `import.meta.env.DEV`): spawns soldiers at the camera
 * focus, sends the next wave and fills the stock, through dev-only commands. Production
 * builds leave it out, and the server rejects the commands.
 */
export function DevSpawnPanel() {
  const dispatch = useGameStore((s) => s.dispatch);
  const [message, setMessage] = useState<string | null>(null);
  const revealMap = useSettingsStore((s) => s.revealMap);
  const toggleRevealMap = useSettingsStore((s) => s.toggleRevealMap);

  const spawn = (unit: UnitKind, owner: PlayerId | undefined) => {
    const side = owner === undefined ? -1 : 1;
    const check = dispatch({
      type: 'debugSpawn',
      unit,
      count: COUNT,
      x: Math.round(cameraFocus.x + side * SIDE_OFFSET),
      z: Math.round(cameraFocus.z),
      ...(owner === undefined ? {} : { owner }),
    });
    setMessage(check.ok ? null : check.issues.join(', '));
  };

  return (
    <section className="hud-panel dev-panel" aria-label="Dev spawn">
      <h2>Dev spawn ×{COUNT}</h2>
      {SOLDIERS.map((unit) => (
        <div key={unit} className="dev-row">
          <span>{UNITS[unit].name}</span>
          <button type="button" onClick={() => spawn(unit, undefined)}>
            Mine
          </button>
          <button type="button" onClick={() => spawn(unit, DEV_ENEMY)}>
            Enemy
          </button>
        </div>
      ))}
      <button
        type="button"
        className="dev-wave"
        onClick={() => {
          const check = dispatch({ type: 'debugWave' });
          setMessage(check.ok ? null : check.issues.join(', '));
        }}
      >
        Send next wave now
      </button>
      <button
        type="button"
        className="dev-wave"
        onClick={() => {
          const check = dispatch({ type: 'debugResources' });
          setMessage(check.ok ? null : check.issues.join(', '));
        }}
      >
        Add {DEBUG_RESOURCES} of every resource
      </button>
      <label className="dev-reveal">
        <input type="checkbox" checked={revealMap} onChange={toggleRevealMap} />
        Reveal map (fog off)
      </label>
      {message && <p className="dev-message">{message}</p>}
    </section>
  );
}
