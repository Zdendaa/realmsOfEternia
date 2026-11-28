import type { AiDifficultyId, AiPersonalityId, BuildingId } from '@roe/game-data';
import type { EntityId, PlayerId, Vec2 } from '@roe/shared';
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

/** An enemy building as it last saw it. */
export interface AiSighting extends Vec2 {
  id: EntityId;
  owner: PlayerId;
  type: BuildingId;
}

/** One expedition of its army: against the guards of a deposit, or against a player. */
export interface AiMission {
  kind: 'camp' | 'raid';
  /** Waiting at the rally point, on the way (and fighting), or coming home. */
  stage: 'gather' | 'march' | 'retreat';
  target: Vec2;
  /** The points still to march by, the target last (`route.ts`). */
  legs: readonly Vec2[];
  /** The deposit it is clearing (`camp`). */
  deposit: number | null;
  units: readonly EntityId[];
  /** Its strength as it set out. */
  strength: number;
  /** Where the army is heading on this hop. */
  hop: Vec2;
  /** Tick the stage began, and tick of the latest hop. */
  stageAt: number;
  hopAt: number;
  /** The enemy it has turned everyone on. */
  focus: EntityId | null;
}

export interface AiArmy {
  mission: AiMission | null;
  /** Whether its base is under attack right now. */
  defending: boolean;
  /** Attacks on players it has sent. */
  raids: number;
  /** How often each deposit's guards have beaten it off. */
  failed: Readonly<Record<number, number>>;
  /** The soldier looking for the enemy, and the points it has still to pass. */
  scout: { unit: EntityId; legs: readonly Vec2[] } | null;
  scoutedAt: number | null;
}

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
  /** What guarded each deposit when it last saw guards there (strength). */
  guards: Readonly<Record<number, number>>;
  /** Enemy buildings it has seen and not seen gone, by id order. */
  sightings: readonly AiSighting[];
  /** Start positions (indices into the map's) it has had in sight. */
  visited: readonly number[];
  army: AiArmy;
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
  guards: {},
  sightings: [],
  visited: [],
  army: { mission: null, defending: false, raids: 0, failed: {}, scout: null, scoutedAt: null },
});
