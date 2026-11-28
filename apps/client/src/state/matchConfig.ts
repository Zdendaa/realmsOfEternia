import {
  isAiDifficultyId,
  isAiPersonalityId,
  PLAYER_COLOR_IDS,
  PROTOTYPE_MAP,
  PROTOTYPE_SETTLEMENT,
  SKIRMISH_MAP,
  SKIRMISH_SETTLEMENT,
  type AiDifficultyId,
  type AiPersonalityId,
  type SettlementLayout,
} from '@roe/game-data';
import { MAX_PLAYERS, type MapDefinition, type PlayerId } from '@roe/shared';
import type { MatchSetup, SeatSetup } from '@roe/sim';

/**
 * The local player's id. In multiplayer the server attaches the real player from the
 * network session; commands themselves never carry it.
 */
export const LOCAL_PLAYER: PlayerId = 'local';

/** The computer player in seat `index` (1-based among the others). */
export const aiPlayerId = (index: number): PlayerId => `ai-${index}`;

export interface MatchConfig {
  map: MapDefinition;
  settlement: SettlementLayout;
  setup: MatchSetup;
}

const DEFAULT_SEED = 1;

const localSeat: SeatSetup = {
  player: LOCAL_PLAYER,
  slot: 0,
  team: 1,
  color: 'blue',
  controller: { kind: 'human' },
};

/** The single-player game: you alone on the prototype map. */
const SOLO: MatchConfig = {
  map: PROTOTYPE_MAP,
  settlement: PROTOTYPE_SETTLEMENT,
  setup: { seed: DEFAULT_SEED, seats: [localSeat] },
};

/** The `index`-th of a comma list, the last one when the list is shorter. */
const pick = (list: string | null, index: number) => {
  const values = list?.split(',') ?? [];
  return values[Math.min(index, values.length - 1)] ?? '';
};

/**
 * The match a development URL asks for (the skirmish setup screen comes later):
 * `?map=skirmish&teams=1,2,2,1&difficulty=hard,normal&personality=defensive&seed=7`.
 * `teams` has one entry per seat (2–4; default `1,2`): the first is you, the rest are
 * computer players. `difficulty` and `personality` list them in order; a shorter list
 * repeats its last value. Anything unreadable falls back to the default.
 */
export function matchFromQuery(query: string): MatchConfig {
  const params = new URLSearchParams(query);
  if (params.get('map') !== 'skirmish') return SOLO;
  const asked = (params.get('teams') ?? '').split(',').map((t) => Number.parseInt(t, 10));
  const valid =
    asked.length >= 2 && asked.length <= MAX_PLAYERS && asked.every((t) => t >= 1 && t <= 4);
  const teams = valid ? asked : [1, 2];
  const seed = Number.parseInt(params.get('seed') ?? '', 10);
  const seats = teams.map((team, i): SeatSetup => {
    const color = PLAYER_COLOR_IDS[i] ?? 'blue';
    if (i === 0) return { ...localSeat, team, color };
    const difficulty = pick(params.get('difficulty'), i - 1);
    const personality = pick(params.get('personality'), i - 1);
    return {
      player: aiPlayerId(i),
      slot: i,
      team,
      color,
      controller: {
        kind: 'ai',
        difficulty: isAiDifficultyId(difficulty) ? (difficulty as AiDifficultyId) : 'normal',
        personality: isAiPersonalityId(personality) ? (personality as AiPersonalityId) : 'balanced',
      },
    };
  });
  return {
    map: SKIRMISH_MAP,
    settlement: SKIRMISH_SETTLEMENT,
    setup: { seed: Number.isNaN(seed) ? DEFAULT_SEED : seed, seats },
  };
}

/** This page's match. Only development builds read the URL. */
export const MATCH: MatchConfig = matchFromQuery(import.meta.env.DEV ? window.location.search : '');

export const seatOf = (player: PlayerId) => MATCH.setup.seats.find((s) => s.player === player);
