import type { ResourceId } from '../resources/definitions.js';

/**
 * How well and how fast a computer player plays. It never sees or earns more than a
 * human: difficulty only sets how often it acts and how much it does at once.
 */
export interface AiDifficultyDefinition {
  name: string;
  /** Seconds between two of its decisions (a whole number of half seconds). */
  thinkSeconds: number;
  /** The most commands it gives in one decision. */
  commandsPerThink: number;
}

export const AI_DIFFICULTIES = {
  easy: { name: 'Easy', thinkSeconds: 3, commandsPerThink: 2 },
  normal: { name: 'Normal', thinkSeconds: 1, commandsPerThink: 5 },
  hard: { name: 'Hard', thinkSeconds: 0.5, commandsPerThink: 10 },
} as const satisfies Record<string, AiDifficultyDefinition>;

export type AiDifficultyId = keyof typeof AI_DIFFICULTIES;

/** What serfs can gather by hand. */
export type GatheredResource = Extract<ResourceId, 'wood' | 'stone'>;

/** What a computer player prefers to do. */
export interface AiPersonalityDefinition {
  name: string;
  /** Serfs it wants (as far as housing and food allow). */
  serfs: number;
  /** How its gathering serfs are shared out, as weights. */
  gather: Readonly<Record<GatheredResource, number>>;
}

export const AI_PERSONALITIES = {
  balanced: { name: 'Balanced', serfs: 14, gather: { wood: 3, stone: 2 } },
  aggressive: { name: 'Aggressive', serfs: 12, gather: { wood: 3, stone: 1 } },
  defensive: { name: 'Defensive', serfs: 14, gather: { wood: 1, stone: 1 } },
} as const satisfies Record<string, AiPersonalityDefinition>;

export type AiPersonalityId = keyof typeof AI_PERSONALITIES;

export const isAiDifficultyId = (id: string): id is AiDifficultyId =>
  Object.hasOwn(AI_DIFFICULTIES, id);

export const isAiPersonalityId = (id: string): id is AiPersonalityId =>
  Object.hasOwn(AI_PERSONALITIES, id);
