import type { BuildingId } from '../buildings/definitions.js';
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
  /** The share of its personality's serfs it recruits. */
  serfShare: number;
  /** Buildings of its build order it has under construction at once. */
  maxSites: number;
  /** Serfs it puts on one site (never more than the building allows). */
  buildersPerSite: number;
  /** Seconds it lets pass after starting a building before starting the next. */
  buildPauseSeconds: number;
}

export const AI_DIFFICULTIES = {
  easy: {
    name: 'Easy',
    thinkSeconds: 3,
    commandsPerThink: 2,
    serfShare: 0.75,
    maxSites: 1,
    buildersPerSite: 2,
    buildPauseSeconds: 45,
  },
  normal: {
    name: 'Normal',
    thinkSeconds: 1,
    commandsPerThink: 5,
    serfShare: 1,
    maxSites: 2,
    buildersPerSite: 3,
    buildPauseSeconds: 10,
  },
  hard: {
    name: 'Hard',
    thinkSeconds: 0.5,
    commandsPerThink: 10,
    serfShare: 1,
    maxSites: 3,
    buildersPerSite: 4,
    buildPauseSeconds: 0,
  },
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
  /** Stock it likes to have beyond its next building's cost: shortages pull serfs over. */
  reserve: Readonly<Record<GatheredResource, number>>;
  /**
   * The buildings it wants, most important first. The n-th mention of a building means
   * it wants n of them, so the list includes what the starting village already has, and
   * whatever is destroyed is rebuilt in this order. Houses aren't listed: it builds them
   * whenever housing runs short. Mines wait until it has seen their deposit unguarded.
   */
  buildOrder: readonly BuildingId[];
}

export const AI_PERSONALITIES = {
  balanced: {
    name: 'Balanced',
    serfs: 14,
    gather: { wood: 3, stone: 2 },
    reserve: { wood: 15, stone: 10 },
    buildOrder: [
      'lumbermill',
      'mill',
      'field',
      'field',
      'bakery',
      'field',
      'quarry',
      'goldMine',
      'ironMine',
      'storehouse',
      'field',
      'mill',
      'lumbermill',
      'field',
      'bakery',
      'field',
    ],
  },
  aggressive: {
    name: 'Aggressive',
    serfs: 12,
    gather: { wood: 3, stone: 1 },
    reserve: { wood: 20, stone: 8 },
    buildOrder: [
      'lumbermill',
      'mill',
      'field',
      'field',
      'bakery',
      'ironMine',
      'goldMine',
      'field',
      'quarry',
      'field',
      'bakery',
      'lumbermill',
      'storehouse',
    ],
  },
  defensive: {
    name: 'Defensive',
    serfs: 14,
    gather: { wood: 1, stone: 1 },
    reserve: { wood: 15, stone: 20 },
    buildOrder: [
      'lumbermill',
      'mill',
      'field',
      'field',
      'bakery',
      'quarry',
      'field',
      'storehouse',
      'field',
      'goldMine',
      'ironMine',
      'field',
      'bakery',
      'mill',
      'field',
    ],
  },
} as const satisfies Record<string, AiPersonalityDefinition>;

export type AiPersonalityId = keyof typeof AI_PERSONALITIES;

export const isAiDifficultyId = (id: string): id is AiDifficultyId =>
  Object.hasOwn(AI_DIFFICULTIES, id);

export const isAiPersonalityId = (id: string): id is AiPersonalityId =>
  Object.hasOwn(AI_PERSONALITIES, id);

/** Rules every computer player follows, whatever its difficulty. */
export const AI_RULES = {
  /** It builds a house when fewer than this many places are free. */
  freeHousing: 4,
  /** With a mine, it recruits no serf that would leave less food than this. */
  mineFoodReserve: 8,
  /** It repairs a building that has lost at least this share of its health... */
  repairAtShare: 0.1,
  /** ...with this many serfs, once no enemy is within `dangerRadius` of it. */
  repairers: 2,
  /** Serfs and buildings stay this far from where it saw enemies. */
  dangerRadius: 18,
  /** Seconds it remembers where it saw enemies (when it can't look again). */
  dangerMemorySeconds: 120,
  /** After finding no room for a building, seconds until it looks again. */
  retrySeconds: 45,
  /** Gatherers move over once a resource has this many times the stock it wants. */
  surplusFactor: 3,
  /** Where it gathers once the home ground (`HOME_RADIUS`) has nothing left. */
  farGatherRadius: 70,
} as const;
