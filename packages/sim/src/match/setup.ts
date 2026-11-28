import {
  isAiDifficultyId,
  isAiPersonalityId,
  PLAYER_COLORS,
  type AiDifficultyId,
  type AiPersonalityId,
  type PlayerColorId,
  type SettlementLayout,
} from '@roe/game-data';
import { MAX_PLAYERS, startSlotsOf, type MapDefinition, type PlayerId } from '@roe/shared';
import { mixSeed } from '../ai/schedule.js';
import type { AiPlayers } from '../ai/state.js';
import { MONSTER_PLAYER, type Teams } from '../combat/hostility.js';
import { createInitialState, type GameState } from '../state/gameState.js';
import { createWorld, type SimWorld } from '../world/createWorld.js';

/** Who plays a seat. */
export type SeatController =
  { kind: 'human' } | { kind: 'ai'; difficulty: AiDifficultyId; personality: AiPersonalityId };

export interface SeatSetup {
  player: PlayerId;
  /** Index into the map's start slots. */
  slot: number;
  /** Seats with the same number are allies. */
  team: number;
  color: PlayerColorId;
  controller: SeatController;
}

/**
 * Everything that, with a map, decides how a match starts. Client and server build the
 * same match from the same setup.
 */
export interface MatchSetup {
  /** Seeds the match's randomness (the computer players'). */
  seed: number;
  seats: readonly SeatSetup[];
}

/** Why `setup` can't be played on `map`, or null when it can. */
export function matchSetupIssue(map: MapDefinition, setup: MatchSetup): string | null {
  const { seats, seed } = setup;
  if (!Number.isInteger(seed)) return 'The seed must be a whole number';
  if (seats.length === 0) return 'A match needs a seat';
  if (seats.length > MAX_PLAYERS) return `At most ${MAX_PLAYERS} seats`;
  const slots = startSlotsOf(map).length;
  const unique = (values: readonly unknown[]) => new Set(values).size === values.length;
  if (!unique(seats.map((s) => s.player))) return 'Two seats have the same player';
  if (!unique(seats.map((s) => s.slot))) return 'Two seats have the same start slot';
  if (!unique(seats.map((s) => s.color))) return 'Two seats have the same color';
  for (const seat of seats) {
    if (!seat.player || seat.player === MONSTER_PLAYER) return `Bad player id "${seat.player}"`;
    if (!Number.isInteger(seat.slot) || seat.slot < 0 || seat.slot >= slots) {
      return `The map has no start slot ${seat.slot}`;
    }
    if (!Number.isInteger(seat.team) || seat.team < 0) return `Bad team ${seat.team}`;
    if (!Object.hasOwn(PLAYER_COLORS, seat.color)) return `Unknown color "${seat.color}"`;
    const { controller } = seat;
    if (controller.kind === 'ai') {
      if (!isAiDifficultyId(controller.difficulty)) return 'Unknown difficulty';
      if (!isAiPersonalityId(controller.personality)) return 'Unknown personality';
    }
  }
  return null;
}

export const teamsOf = (setup: MatchSetup): Teams =>
  Object.fromEntries(setup.seats.map((seat) => [seat.player, seat.team]));

/** A fresh memory for every computer player of the match. */
export function aiPlayersOf(setup: MatchSetup): AiPlayers {
  let order = 0;
  return Object.fromEntries(
    setup.seats.flatMap(({ player, slot, controller }) => {
      if (controller.kind !== 'ai') return [];
      const { difficulty, personality } = controller;
      const seed = mixSeed(setup.seed, slot);
      return [[player, { difficulty, personality, seed, order: order++, log: [] }]];
    }),
  );
}

export interface Match {
  world: SimWorld;
  state: GameState;
}

/** The world and first state of a match: a settlement for every seat at its start slot. */
export function createMatch(
  map: MapDefinition,
  settlement: SettlementLayout,
  setup: MatchSetup,
): Match {
  const issue = matchSetupIssue(map, setup);
  if (issue) throw new Error(`Bad match setup: ${issue}`);
  const world = createWorld(
    map,
    settlement,
    setup.seats.map((seat) => seat.slot),
  );
  return { world, state: createInitialState(world, { setup }) };
}
