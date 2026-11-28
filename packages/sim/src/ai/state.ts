import type { AiDifficultyId, AiPersonalityId } from '@roe/game-data';
import type { PlayerId } from '@roe/shared';
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
}

export type AiPlayers = Readonly<Record<PlayerId, AiState>>;
