import { abilityOf, UNITS, type AbilityId, type HeroId } from '@roe/game-data';
import { SIMULATION_TICK_RATE, type EntityId } from '@roe/shared';
import { abilitiesOf } from '@roe/sim';
import type { CSSProperties } from 'react';
import { ABILITY_KEYS, activeHero, triggerAbility } from '../input/abilityAim';
import { useCommandModeStore } from '../state/commandModeStore';
import { useGameStore } from '../state/gameStore';
import { experienceProgress } from './heroes/experience';

/**
 * The active hero as "id,type,level,experience|ability:locked level:seconds left|...",
 * so the bar re-renders only when something shown would change.
 */
function useHeroAbilities(selected: readonly EntityId[]) {
  return useGameStore(({ state }) => {
    const hero = activeHero(state.units, selected);
    if (!hero?.hero) return '';
    const { level, experience, cooldowns } = hero.hero;
    const entries = abilitiesOf(hero).map((id) => {
      const needs = abilityOf(id).level;
      const wait = Math.ceil(((cooldowns[id] ?? 0) - state.tick) / SIMULATION_TICK_RATE);
      return `${id}:${level < needs ? needs : 0}:${Math.max(0, wait)}`;
    });
    return [[hero.id, hero.type, level, experience].join(), ...entries].join('|');
  });
}

/**
 * The active hero (the first selected one): its experience and its abilities. Click or
 * press the key; aimed ones then wait for a target. A used one fills up again as its
 * cooldown runs.
 */
export function AbilityBar({
  selected,
  named,
}: {
  selected: readonly EntityId[];
  /** Say whose they are (a group is selected). */
  named: boolean;
}) {
  const summary = useHeroAbilities(selected);
  const aiming = useCommandModeStore((s) => s.aim?.ability);
  if (!summary) return null;
  const [about = '', ...entries] = summary.split('|');
  const [id = '', type = '', level, experience] = about.split(',');
  const progress = experienceProgress(Number(level), Number(experience));

  return (
    <div className="hero-abilities">
      {named && (
        <p className="hero-title">
          <strong>{UNITS[type as HeroId].name}</strong>
          <span>Level {level}</span>
        </p>
      )}
      <span className="hero-bar hero-experience">
        <span style={{ width: `${progress.share * 100}%` }} />
      </span>
      <p className="selection-meta">{progress.text}</p>
      <ul className="ability-bar" aria-label="Abilities">
        {entries.map((entry, slot) => {
          const [ability = '', locked = '0', wait = '0'] = entry.split(':');
          const definition = abilityOf(ability as AbilityId);
          const cooling = Number(wait) / definition.cooldown;
          return (
            <li key={ability}>
              <button
                type="button"
                className={`selection-action ability ${aiming === ability ? 'is-active' : ''}`}
                style={{ '--cooling': `${cooling * 100}%` } as CSSProperties}
                disabled={locked !== '0' || wait !== '0'}
                title={`${definition.description} Cooldown ${definition.cooldown} s.`}
                onClick={() => triggerAbility(Number(id), ability as AbilityId)}
              >
                <kbd>{ABILITY_KEYS[slot]?.label}</kbd>
                <span className="ability-name">{definition.name}</span>
                {locked !== '0' && <span className="ability-wait">Level {locked}</span>}
                {locked === '0' && wait !== '0' && <span className="ability-wait">{wait} s</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
