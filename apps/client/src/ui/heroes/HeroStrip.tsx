import { HERO_RULES, UNITS, type HeroId } from '@roe/game-data';
import type { EntityId } from '@roe/shared';
import { isAlive, maxHealthOf, REVIVE_TICKS, reviveStatus, type ReviveStatus } from '@roe/sim';
import { cameraRig } from '../../render/camera/cameraRig';
import { LOCAL_PLAYER, useGameStore } from '../../state/gameStore';
import { useSelectionStore } from '../../state/selectionStore';
import { experienceProgress } from './experience';

const FALLEN: Record<ReviveStatus, string> = {
  reviving: 'Reviving',
  noUnit: `Fallen: bring a unit within ${HERO_RULES.reviveRadius}`,
  contested: 'Revival held up: enemies near',
};

/**
 * The player's heroes as one string, "id,type,level,experience,health,fullHealth,fallen,
 * revival percent" each, so the list re-renders only when something shown changes.
 */
function useHeroes() {
  return useGameStore(({ state }) => {
    const alive = state.units
      .filter((u) => u.hero && u.ownerId === LOCAL_PLAYER && isAlive(u))
      .map((u) =>
        [u.id, u.type, u.hero?.level, u.hero?.experience, u.health, maxHealthOf(u), '', 0].join(),
      );
    const fallen = state.graves
      .filter((g) => g.ownerId === LOCAL_PLAYER)
      .map((g) => {
        const percent = Math.floor((100 * g.progress) / REVIVE_TICKS);
        const status = reviveStatus(state.teams, g, state.units);
        const { level, experience } = g.state;
        return [g.id, g.hero, level, experience, 0, 1, status, percent].join();
      });
    // By id, so a hero keeps its place when it falls and when it returns.
    return [...alive, ...fallen]
      .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10))
      .join(';');
  });
}

/** Where the hero (or its grave) is now. */
function whereIs(id: EntityId) {
  const { state } = useGameStore.getState();
  return state.units.find((u) => u.id === id) ?? state.graves.find((g) => g.id === id);
}

const lookAtHero = (id: EntityId) => {
  const at = whereIs(id);
  if (at) cameraRig.current?.lookAt(at.x, at.z);
};

/**
 * The player's heroes, always at hand: level, health, experience, and for a fallen one
 * how its revival stands. Click selects the hero (a fallen one: shows its grave),
 * double click moves the camera there.
 */
export function HeroStrip() {
  const heroes = useHeroes();
  const selected = useSelectionStore((s) => s.units);
  const select = useSelectionStore((s) => s.selectUnits);
  if (!heroes) return null;

  return (
    <ul className="hud-panel hero-strip" aria-label="Your heroes">
      {heroes.split(';').map((entry) => {
        const [id = '', type = '', level, experience, health, full, status = '', percent] =
          entry.split(',');
        const heroId = Number(id);
        const fallen = status !== '';
        const progress = experienceProgress(Number(level), Number(experience));
        const bar = fallen ? Number(percent) / 100 : Number(health) / Number(full);
        return (
          <li key={id}>
            <button
              type="button"
              className={`hero-card ${fallen ? `is-fallen is-${status}` : ''} ${
                selected.includes(heroId) ? 'is-selected' : ''
              }`}
              title={
                fallen
                  ? 'Click to see the grave'
                  : 'Click to select, double click to move the camera there'
              }
              onClick={() => (fallen ? lookAtHero(heroId) : select([heroId]))}
              onDoubleClick={() => lookAtHero(heroId)}
            >
              <span className="hero-title">
                <strong>{UNITS[type as HeroId].name}</strong>
                <span>Level {level}</span>
              </span>
              <span className="hero-bar hero-health" title={`${health} / ${full}`}>
                <span style={{ width: `${bar * 100}%` }} />
              </span>
              <span className="hero-bar hero-experience" title={progress.text}>
                <span style={{ width: `${progress.share * 100}%` }} />
              </span>
              {fallen && (
                <span className="hero-note">
                  {FALLEN[status as ReviveStatus]} · {percent}%
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
