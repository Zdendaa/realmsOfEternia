import type { AiDifficultyId, AiPersonalityId, BuildingId } from '@roe/game-data';
import type { PlayerId, Vec2 } from '@roe/shared';
import type { CommandIssue } from '../commands/applyCommand.js';

/** How many of its latest decisions a computer player remembers (for the inspector). */
export const AI_LOG_LENGTH = 8;

/** One command a computer player gave, and how it went. */
export interface AiDecision {
  tick: number;
  /** What it meant to do, in a few words. */
  note: string;
  /** Why the command was refused; absent when it was carried out. */
  refused?: readonly CommandIssue[];
}

/** Where it saw enemies, and when it last did. */
export type AiDanger = Vec2 & { at: number };

/**
 * What it saw of an ore deposit the last time it could see it: `clear` (no enemy
 * around, a mine can go there) or `held`. A deposit it never saw has no entry.
 */
export type AiDeposit = 'clear' | 'held';

/** The building it wants next, and what it waits for. */
export interface AiGoal {
  building: BuildingId;
  waiting: 'resources' | 'pause' | 'sites' | null;
}

/** A search for a building spot that goes on at its next decision. */
export interface AiSearch {
  building: BuildingId;
  /** The candidate to go on from. */
  next: number;
}

/**
 * One computer player's memory: plain data in `GameState.ai`, changed only by the AI
 * phase of the tick, so a saved or replayed match goes on the same way. Nothing the AI
 * decides from may live anywhere else (caches may only make it faster). Never part of a
 * `PlayerView`.
 */
export interface AiState {
  difficulty: AiDifficultyId;
  personality: AiPersonalityId;
  /** Seeds its randomness (from the match seed and its start slot). */
  seed: number;
  /** Its place among the computer players (0…): staggers when they think. */
  order: number;
  /** Its latest commands, oldest first. */
  log: readonly AiDecision[];
  /** The next building, or null when its build order is met (or nothing can be built). */
  goal: AiGoal | null;
  search: AiSearch | null;
  /** Tick it last started a building of its build order, or null. */
  builtAt: number | null;
  /** Buildings it found no room for, with the tick it may look again. */
  noRoom: Readonly<Partial<Record<BuildingId, number>>>;
  dangers: readonly AiDanger[];
  /** By index into the map's deposits. */
  deposits: Readonly<Record<number, AiDeposit>>;
}

export type AiPlayers = Readonly<Record<PlayerId, AiState>>;

/** A computer player that has seen and done nothing yet. */
export const freshAiState = (
  setup: Pick<AiState, 'difficulty' | 'personality' | 'seed' | 'order'>,
): AiState => ({
  ...setup,
  log: [],
  goal: null,
  search: null,
  builtAt: null,
  noRoom: {},
  dangers: [],
  deposits: {},
});
