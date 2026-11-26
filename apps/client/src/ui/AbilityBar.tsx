import { abilityOf, type AbilityId } from '@roe/game-data';
import { SIMULATION_TICK_RATE, type EntityId } from '@roe/shared';
import { abilitiesOf } from '@roe/sim';
import { ABILITY_KEYS, activeHero, triggerAbility } from '../input/abilityAim';
import { useCommandModeStore } from '../state/commandModeStore';
import { useGameStore } from '../state/gameStore';

/**
 * The active hero as "id|ability:locked level:seconds left|...", so the bar re-renders
 * only when a button would change.
 */
function useHeroAbilities(selected: readonly EntityId[]) {
  return useGameStore(({ state }) => {
    const hero = activeHero(state.units, selected);
    if (!hero?.hero) return '';
    const { level, cooldowns } = hero.hero;
    const entries = abilitiesOf(hero).map((id) => {
      const needs = abilityOf(id).level;
      const wait = Math.ceil(((cooldowns[id] ?? 0) - state.tick) / SIMULATION_TICK_RATE);
      return `${id}:${level < needs ? needs : 0}:${Math.max(0, wait)}`;
    });
    return [hero.id, ...entries].join('|');
  });
}

/** The active hero's abilities: click or press the key; aimed ones then wait for a target. */
export function AbilityBar({ selected }: { selected: readonly EntityId[] }) {
  const summary = useHeroAbilities(selected);
  const aiming = useCommandModeStore((s) => s.aim?.ability);
  if (!summary) return null;
  const [id = '', ...entries] = summary.split('|');

  return (
    <ul className="ability-bar" aria-label="Abilities">
      {entries.map((entry, slot) => {
        const [ability = '', locked = '0', wait = '0'] = entry.split(':');
        const definition = abilityOf(ability as AbilityId);
        const status =
          locked !== '0' ? `Level ${locked}` : wait !== '0' ? `${wait} s` : definition.description;
        return (
          <li key={ability}>
            <button
              type="button"
              className={`selection-action ability ${aiming === ability ? 'is-active' : ''}`}
              disabled={locked !== '0' || wait !== '0'}
              title={`${definition.description} Cooldown ${definition.cooldown} s.`}
              onClick={() => triggerAbility(Number(id), ability as AbilityId)}
            >
              <kbd>{ABILITY_KEYS[slot]?.label}</kbd>
              <span className="ability-name">{definition.name}</span>
              {(locked !== '0' || wait !== '0') && <span className="ability-wait">{status}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
