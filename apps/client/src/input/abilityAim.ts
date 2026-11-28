import { abilityOf, type AbilityId } from '@roe/game-data';
import type { EntityId, Vec2 } from '@roe/shared';
import {
  abilitiesOf,
  abilityIssue,
  castInRange,
  isAlive,
  validateCommand,
  type BuildingInstance,
  type CastTarget,
  type CommandIssue,
  type UnitInstance,
} from '@roe/sim';
import { LOCAL_PLAYER, useGameStore } from '../state/gameStore';
import { useCommandModeStore, type AimFeedback } from '../state/commandModeStore';
import { usePlacementStore } from '../state/placementStore';
import { useSelectionStore } from '../state/selectionStore';
import type { PointerTarget } from './pointerTarget';

/**
 * Using a hero's abilities: self-cast ones go off at once; aimed ones wait for the
 * mouse. Nothing is ever aimed for the player.
 */

/** The own living hero with that id. */
export const ownHero = (unitId: EntityId): UnitInstance | undefined =>
  useGameStore
    .getState()
    .state.units.find((u) => u.id === unitId && u.ownerId === LOCAL_PLAYER && u.hero && isAlive(u));

/** The hero the ability keys speak to: the first selected one (state order). */
export function activeHero(
  units: readonly UnitInstance[],
  selected: readonly EntityId[],
): UnitInstance | undefined {
  const wanted = new Set(selected);
  return units.find((u) => wanted.has(u.id) && u.ownerId === LOCAL_PLAYER && u.hero && isAlive(u));
}

/** A button or hotkey: cast a self-cast ability, or start aiming an aimed one. */
export function triggerAbility(unitId: EntityId, ability: AbilityId): void {
  const { state, dispatch } = useGameStore.getState();
  const hero = ownHero(unitId);
  if (!hero || abilityIssue(hero, ability, state.tick)) return;
  // The construction tool and aiming don't run at the same time.
  usePlacementStore.getState().select(null);
  if (abilityOf(ability).target === 'self') {
    useCommandModeStore.getState().setMode(null);
    dispatch({ type: 'useAbility', unitId, ability });
  } else useCommandModeStore.getState().startAim({ unitId, ability });
}

/** The ability keys (Q, E, R: in the order the abilities unlock). */
export const ABILITY_KEYS = [
  { code: 'KeyQ', label: 'Q' },
  { code: 'KeyE', label: 'E' },
  { code: 'KeyR', label: 'R' },
] as const;

/** Presses the ability on `code` for the active hero; false when it is no ability key. */
export function pressAbilityKey(code: string): boolean {
  const slot = ABILITY_KEYS.findIndex((key) => key.code === code);
  if (slot < 0) return false;
  const hero = activeHero(useGameStore.getState().state.units, useSelectionStore.getState().units);
  const ability = hero && abilitiesOf(hero)[slot];
  if (hero && ability) triggerAbility(hero.id, ability);
  return true;
}

const PROBLEMS: Partial<Record<CommandIssue, string>> = {
  notVisible: 'Not in sight',
  outOfBounds: 'Outside the map',
  notEnemy: 'Pick an enemy building or wall',
  noTarget: 'Pick an enemy building or wall',
  onCooldown: 'Not ready yet',
  gameOver: 'The game is over',
};

export interface AimResult extends AimFeedback {
  /** What a click would cast at; null when there is nothing to aim at. */
  target: CastTarget | null;
  /** Where the area ring goes. */
  center: Vec2;
  /** The building aimed at (building abilities). */
  building: BuildingInstance | null;
}

/**
 * What aiming `ability` at what's under the pointer would do: the same checks as the
 * sim's, plus range: a target out of reach can't be clicked (the player moves the hero
 * closer first). Null when the pointer is off the ground.
 */
export function judgeAim(
  hero: UnitInstance,
  ability: AbilityId,
  pointer: PointerTarget,
): AimResult | null {
  const { ctx, state } = useGameStore.getState();
  const wantsBuilding = abilityOf(ability).target === 'building';
  const building = wantsBuilding ? pointer.building : null;
  const ground = pointer.ground;
  const center = building ?? ground;
  if (!center) return null;
  const at = { center: { x: center.x, z: center.z }, building };
  const target: CastTarget | null = wantsBuilding
    ? building && { id: building.id }
    : { x: center.x, z: center.z };
  if (!target) {
    return { ...at, target, ok: false, problem: 'Pick an enemy building or wall' };
  }
  const check = validateCommand(ctx, state, LOCAL_PLAYER, {
    type: 'useAbility',
    unitId: hero.id,
    ability,
    target,
  });
  if (!check.ok) {
    const issue = check.issues[0];
    const problem = (issue && PROBLEMS[issue]) ?? 'Can’t cast there';
    return { ...at, target, ok: false, problem };
  }
  const reachable = castInRange(state.teams, hero, ability, target, state.buildings);
  return { ...at, target, ok: reachable, problem: reachable ? null : 'Out of range' };
}

/**
 * Left click while aiming: casts if the target under the pointer is good, and ends the
 * aiming. A bad target does nothing: the aiming goes on.
 */
export function castAimed(pointer: PointerTarget): void {
  const { aim, setMode } = useCommandModeStore.getState();
  const hero = aim && ownHero(aim.unitId);
  if (!aim || !hero) return setMode(null);
  const result = judgeAim(hero, aim.ability, pointer);
  if (!result?.ok || !result.target) return;
  const check = useGameStore.getState().dispatch({
    type: 'useAbility',
    unitId: aim.unitId,
    ability: aim.ability,
    target: result.target,
  });
  if (check.ok) setMode(null);
}
