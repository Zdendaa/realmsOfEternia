import { abilityOf, type AbilityId } from '@roe/game-data';
import { SIMULATION_TICK_RATE } from '@roe/shared';
import { abilitiesOf, areEnemies, isAlive, type CastTarget } from '@roe/sim';
import { useState } from 'react';
import { cameraFocus } from '../../render/camera/cameraFocus';
import { LOCAL_PLAYER, useGameStore } from '../../state/gameStore';
import { useSelectionStore } from '../../state/selectionStore';

/** The first selected living hero, as "id:ability=state,..." so it re-renders on change. */
function useHeroSummary(selected: readonly number[]) {
  return useGameStore(({ state }) => {
    const hero = state.units.find((u) => u.hero && isAlive(u) && selected.includes(u.id));
    if (!hero?.hero) return '';
    const { level, cooldowns } = hero.hero;
    const list = abilitiesOf(hero).map((id) => {
      const needs = abilityOf(id).level;
      const wait = Math.ceil(((cooldowns[id] ?? 0) - state.tick) / SIMULATION_TICK_RATE);
      return `${id}=${level < needs ? `level ${needs}` : wait > 0 ? `${wait} s` : ''}`;
    });
    return `${hero.id}:${list.join(',')}`;
  });
}

/** What an ability is aimed at from the dev panel: the middle of the screen. */
function aimAtFocus(ability: AbilityId): CastTarget | undefined | null {
  const kind = abilityOf(ability).target;
  if (kind === 'self') return undefined;
  const { x, z } = cameraFocus;
  if (kind === 'point') return { x, z };
  const away = (b: { x: number; z: number }) => Math.hypot(b.x - x, b.z - z);
  const [nearest] = useGameStore
    .getState()
    .state.buildings.filter((b) => areEnemies(LOCAL_PLAYER, b.ownerId))
    .sort((a, b) => away(a) - away(b));
  return nearest ? { id: nearest.id } : null;
}

/**
 * Development only, until the hero panel exists: buttons for the selected hero's
 * abilities. Aimed ones go to the middle of the screen (a building ability: the enemy
 * building nearest to it).
 */
export function DevHeroAbilities() {
  const [message, onMessage] = useState<string | null>(null);
  const selected = useSelectionStore((s) => s.units);
  const summary = useHeroSummary(selected);
  if (!summary) return null;
  const [id = '', list = ''] = summary.split(':');

  const use = (ability: AbilityId) => {
    const target = aimAtFocus(ability);
    if (target === null) return onMessage('No enemy building to aim at');
    const check = useGameStore.getState().dispatch({
      type: 'useAbility',
      unitId: Number(id),
      ability,
      ...(target === undefined ? {} : { target }),
    });
    onMessage(check.ok ? null : check.issues.join(', '));
  };

  return (
    <section className="hud-panel dev-abilities" aria-label="Hero abilities (dev)">
      <p className="dev-aim">Aimed ones go to the screen center</p>
      {list.split(',').map((entry) => {
        const [ability = '', blocked = ''] = entry.split('=');
        const definition = abilityOf(ability as AbilityId);
        return (
          <button
            key={ability}
            type="button"
            className="dev-wave"
            disabled={blocked !== ''}
            title={definition.description}
            onClick={() => use(ability as AbilityId)}
          >
            {definition.name}
            {blocked && ` (${blocked})`}
          </button>
        );
      })}
      {message && <p className="dev-message">{message}</p>}
    </section>
  );
}
