import { UNITS, type UnitKind } from '@roe/game-data';
import type { PlayerId } from '@roe/shared';
import { DEBUG_RESOURCES } from '@roe/sim';
import { useState } from 'react';
import { cameraFocus } from '../../render/camera/cameraFocus';
import { useGameStore } from '../../state/gameStore';
import { useSelectionStore } from '../../state/selectionStore';
import { useSettingsStore } from '../../state/settingsStore';
import { DevMatchPicker } from './DevMatchPicker';

/** The opponent the dev panel spawns for (any id other than the local player is hostile). */
const DEV_ENEMY: PlayerId = 'enemy';
/** What the panel spawns, and how many at a time. */
const SPAWNS: readonly { unit: UnitKind; count: number }[] = [
  { unit: 'swordsman', count: 5 },
  { unit: 'spearman', count: 5 },
  { unit: 'archer', count: 5 },
  { unit: 'ram', count: 2 },
  { unit: 'catapult', count: 2 },
  // One of each per player: "Mine" is refused while you have the map's hero.
  { unit: 'commander', count: 1 },
  { unit: 'archmage', count: 1 },
];
/** Experience one press gives the selected heroes. */
const EXPERIENCE = 150;
/** Own units appear left of the camera focus, enemies to its right, facing each other. */
const SIDE_OFFSET = 8;

/**
 * Development only (mounted when `import.meta.env.DEV`): spawns soldiers and siege
 * engines at the camera focus, raises a walled base there, sends the next wave and
 * fills the stock, through dev-only commands. Production
 * builds leave it out, and the server rejects the commands.
 */
export function DevSpawnPanel() {
  const dispatch = useGameStore((s) => s.dispatch);
  const [message, setMessage] = useState<string | null>(null);
  const revealMap = useSettingsStore((s) => s.revealMap);
  const toggleRevealMap = useSettingsStore((s) => s.toggleRevealMap);

  const fort = (owner: PlayerId | undefined) => {
    const { x, z } = cameraFocus;
    const check = dispatch({ type: 'debugFort', x, z, ...(owner === undefined ? {} : { owner }) });
    setMessage(check.ok ? null : check.issues.join(', '));
  };

  const spawn = (unit: UnitKind, count: number, owner: PlayerId | undefined) => {
    const side = owner === undefined ? -1 : 1;
    const check = dispatch({
      type: 'debugSpawn',
      unit,
      count,
      x: Math.round(cameraFocus.x + side * SIDE_OFFSET),
      z: Math.round(cameraFocus.z),
      ...(owner === undefined ? {} : { owner }),
    });
    setMessage(check.ok ? null : check.issues.join(', '));
  };

  return (
    <section className="hud-panel dev-panel" aria-label="Dev spawn">
      <h2>Dev spawn</h2>
      <DevMatchPicker />
      {SPAWNS.map(({ unit, count }) => (
        <div key={unit} className="dev-row">
          <span>
            {UNITS[unit].name} ×{count}
          </span>
          <button type="button" onClick={() => spawn(unit, count, undefined)}>
            Mine
          </button>
          <button type="button" onClick={() => spawn(unit, count, DEV_ENEMY)}>
            Enemy
          </button>
        </div>
      ))}
      <div
        className="dev-row"
        title="A finished stone-walled base with towers, centered on the view"
      >
        <span>Walled base</span>
        <button type="button" onClick={() => fort(undefined)}>
          Mine
        </button>
        <button type="button" onClick={() => fort(DEV_ENEMY)}>
          Enemy
        </button>
      </div>
      <button
        type="button"
        className="dev-wave"
        onClick={() => {
          const unitIds = [...useSelectionStore.getState().units];
          const check = dispatch({ type: 'debugExperience', unitIds, amount: EXPERIENCE });
          setMessage(check.ok ? null : 'Select your hero first');
        }}
      >
        Selected heroes +{EXPERIENCE} experience
      </button>
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
