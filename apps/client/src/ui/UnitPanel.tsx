import {
  combatOf,
  UNITS,
  type ArmorClass,
  type AttackDefinition,
  type UnitKind,
} from '@roe/game-data';
import { isAlive, maxHealthOf, unitAttack, type UnitActivity } from '@roe/sim';
import { useEffect } from 'react';
import { useCommandModeStore } from '../state/commandModeStore';
import { useGameStore } from '../state/gameStore';
import { useSelectionStore } from '../state/selectionStore';

/** "Swordsman" → "swordsmen", "Serf" → "serfs". */
const plural = (name: string) =>
  (name.endsWith('man') ? `${name.slice(0, -3)}men` : `${name}s`).toLowerCase();

/** What limits an attack, for the stats ("Hits buildings only"). */
function limits(attack: AttackDefinition) {
  return [
    attack.buildingsOnly && 'Hits buildings only, never units.',
    attack.minRange !== undefined && `Can’t hit anything closer than ${attack.minRange}.`,
    attack.splash && 'Hits everything around where its shot lands; moving units dodge.',
  ].filter((line): line is string => typeof line === 'string');
}

const CLASS_NAMES: Record<ArmorClass, string> = {
  villager: 'villagers',
  infantry: 'infantry',
  ranged: 'archers',
  building: 'buildings',
  monster: 'monsters',
  cavalry: 'cavalry',
  siege: 'siege engines',
};

/** "Strong against infantry (×1.5)" lines from an attack's bonuses. */
function counters(attack: AttackDefinition) {
  const entries = Object.entries(attack.bonus ?? {}) as [ArmorClass, number][];
  const describe = (list: [ArmorClass, number][]) =>
    list.map(([cls, factor]) => `${CLASS_NAMES[cls]} (×${factor})`).join(', ');
  return {
    strong: describe(entries.filter(([cls, f]) => f > 1 && cls !== 'cavalry')),
    weak: describe(entries.filter(([, f]) => f < 1)),
  };
}

/** Drops units that died or vanished from the selection, once per tick at most. */
function usePruneSelection() {
  useEffect(
    () =>
      useGameStore.subscribe((s, previous) => {
        if (s.state.units === previous.state.units) return;
        const selection = useSelectionStore.getState();
        if (selection.units.length === 0) return;
        const alive = new Set(s.state.units.filter(isAlive).map((u) => u.id));
        const kept = selection.units.filter((id) => alive.has(id));
        if (kept.length !== selection.units.length) selection.selectUnits(kept);
      }),
    [],
  );
}

/**
 * The selection as one string, so the panel re-renders only when it changes: per unit
 * kind "kind:count:health:maxHealth", then activity counts, and the single unit\'s id.
 */
function useSelectionSummary(ids: readonly number[]) {
  return useGameStore((s) => {
    const wanted = new Set(ids);
    /** Per kind: count, health, full health, and for a hero its level and damage. */
    const kinds = new Map<UnitKind, [number, number, number, number, number]>();
    const activity: Record<UnitActivity, number> = {
      idle: 0,
      walking: 0,
      working: 0,
      attacking: 0,
      casting: 0,
      dying: 0,
    };
    for (const u of s.state.units) {
      if (!wanted.has(u.id) || !isAlive(u)) continue;
      const entry = kinds.get(u.type) ?? [0, 0, 0, 0, 0];
      entry[0]++;
      entry[1] += u.health;
      entry[2] += maxHealthOf(u);
      if (u.hero) {
        entry[3] = u.hero.level;
        entry[4] = unitAttack(u)?.damage ?? 0;
      }
      kinds.set(u.type, entry);
      activity[u.activity]++;
    }
    const groups = [...kinds].map(([kind, stats]) => [kind, ...stats].join(':'));
    const { attacking, casting, working, walking, idle } = activity;
    const acts = [attacking, working, walking, idle, casting].join();
    return `${groups.join('|')};${acts}`;
  });
}

/** One unit kind\'s stats: health, attack, reach, armor, speed, counters. */
function UnitStats({
  kind,
  health,
  max,
  level,
  damage,
}: {
  kind: UnitKind;
  health: number;
  max: number;
  /** 0 for units that aren't heroes. */
  level: number;
  /** A hero's damage at its level. */
  damage: number;
}) {
  const definition = UNITS[kind];
  const combat = combatOf(kind);
  const attack = combat.attack;
  const lines = attack ? counters(attack) : null;
  return (
    <>
      <p className="selection-meta">{definition.description}</p>
      <div className="unit-health" title={`${health} / ${max}`}>
        <span style={{ width: `${(health / max) * 100}%` }} />
      </div>
      <dl className="unit-stats">
        {level > 0 && (
          <>
            <dt>Level</dt>
            <dd>{level}</dd>
          </>
        )}
        <dt>Health</dt>
        <dd>
          {health} / {max}
        </dd>
        {attack && (
          <>
            <dt>Attack</dt>
            <dd>
              {level > 0 ? damage : attack.damage} every {attack.cooldown} s
            </dd>
            <dt>Range</dt>
            <dd>{attack.kind === 'melee' ? 'melee' : attack.range}</dd>
          </>
        )}
        <dt>Armor</dt>
        <dd>{combat.armor}</dd>
        <dt>Speed</dt>
        <dd>{definition.speed}</dd>
      </dl>
      {attack &&
        limits(attack).map((line) => (
          <p key={line} className="selection-meta">
            {line}
          </p>
        ))}
      {lines?.strong && <p className="selection-meta">Strong against {lines.strong}</p>}
      {lines?.weak && <p className="selection-meta">Weak against {lines.weak}</p>}
    </>
  );
}

/** Attack-move and stop for selections with soldiers (also F and X). */
function CommandBar({ ids }: { ids: readonly number[] }) {
  const mode = useCommandModeStore((s) => s.mode);
  const setMode = useCommandModeStore((s) => s.setMode);
  const dispatch = useGameStore((s) => s.dispatch);
  return (
    <div className="selection-action-row">
      <button
        type="button"
        className={`selection-action ${mode === 'attackMove' ? 'is-active' : ''}`}
        onClick={() => setMode(mode === 'attackMove' ? null : 'attackMove')}
        title="Then click a point: walk there, fighting every enemy on the way"
      >
        Attack-move (F)
      </button>
      <button
        type="button"
        className="selection-action"
        onClick={() => dispatch({ type: 'stop', unitIds: [...ids] })}
      >
        Stop (X)
      </button>
    </div>
  );
}

/**
 * Selected units: one unit shows its stats; a group shows how many of each kind (with
 * their health) and what they are doing. Soldiers get the command bar.
 */
export function UnitPanel({ ids }: { ids: readonly number[] }) {
  usePruneSelection();
  const summary = useSelectionSummary(ids);
  const [groupText = '', actText = ''] = summary.split(';');
  const groups = groupText
    ? groupText.split('|').map((g) => {
        const [kind, n, hp, max, level, damage] = g.split(':');
        return {
          kind: kind as UnitKind,
          n: Number(n),
          hp: Number(hp),
          max: Number(max),
          level: Number(level),
          damage: Number(damage),
        };
      })
    : [];
  const [attacking = 0, working = 0, walking = 0, idle = 0, casting = 0] = actText
    .split(',')
    .map(Number);
  const total = groups.reduce((sum, g) => sum + g.n, 0);
  if (total === 0) return null;
  const fighters = groups.some((g) => combatOf(g.kind).attack);
  const single = total === 1 ? groups[0] : undefined;

  return (
    <section className="hud-panel selection-panel" aria-label="Selection">
      <h2>{single ? UNITS[single.kind].name : `${total} units`}</h2>
      {single ? (
        <UnitStats
          kind={single.kind}
          health={single.hp}
          max={single.max}
          level={single.level}
          damage={single.damage}
        />
      ) : (
        <ul className="unit-groups">
          {groups.map((g) => (
            <li key={g.kind} title={`Health ${g.hp} / ${g.max}`}>
              <span>
                {g.n} {g.n === 1 ? UNITS[g.kind].name.toLowerCase() : plural(UNITS[g.kind].name)}
              </span>
              <span className="unit-health">
                <span style={{ width: `${(g.hp / g.max) * 100}%` }} />
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="selection-meta">
        {[
          casting && `${casting} casting`,
          attacking && `${attacking} fighting`,
          working && `${working} working`,
          walking && `${walking} walking`,
          idle && `${idle} idle`,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {fighters ? (
        <CommandBar ids={ids} />
      ) : (
        <p className="selection-meta">
          Right-click: move · a construction site: build · a damaged building: repair · a tree or
          rock: gather
        </p>
      )}
    </section>
  );
}
