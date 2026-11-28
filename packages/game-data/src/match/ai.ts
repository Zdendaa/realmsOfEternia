/** How well and how fast a computer player plays. It never sees or earns more than a human. */
export interface AiDifficultyDefinition {
  name: string;
}

export const AI_DIFFICULTIES = {
  easy: { name: 'Easy' },
  normal: { name: 'Normal' },
  hard: { name: 'Hard' },
} as const satisfies Record<string, AiDifficultyDefinition>;

export type AiDifficultyId = keyof typeof AI_DIFFICULTIES;

/** What a computer player prefers to do. */
export interface AiPersonalityDefinition {
  name: string;
}

export const AI_PERSONALITIES = {
  balanced: { name: 'Balanced' },
  aggressive: { name: 'Aggressive' },
  defensive: { name: 'Defensive' },
} as const satisfies Record<string, AiPersonalityDefinition>;

export type AiPersonalityId = keyof typeof AI_PERSONALITIES;

export const isAiDifficultyId = (id: string): id is AiDifficultyId =>
  Object.hasOwn(AI_DIFFICULTIES, id);

export const isAiPersonalityId = (id: string): id is AiPersonalityId =>
  Object.hasOwn(AI_PERSONALITIES, id);
