import { AI_DIFFICULTIES, AI_PERSONALITIES } from '@roe/game-data';
import type { PlayerId } from '@roe/shared';
import type { CommandResult } from '../commands/applyCommand.js';
import type { IssuedCommand } from '../commands/types.js';
import type { SimContext } from '../context/simContext.js';
import type { GameState } from '../state/gameState.js';
import { manageBase } from './base.js';
import { searchBuildingSpot, SPOT_RULES } from './buildingSpot.js';
import { manageEconomy } from './economy.js';
import { aiKnowledge } from './knowledge.js';
import type { ManagerInput } from './manager.js';
import { observe } from './memory.js';
import { aiRng, isThinkTick } from './schedule.js';
import { AI_LOG_LENGTH, type AiDecision, type AiPlayers, type AiState } from './state.js';

/** A command a computer player gives this tick, with why it gives it. */
export interface AiCommand extends IssuedCommand {
  note: string;
}

export interface AiThoughts {
  commands: AiCommand[];
  /** The memories after looking and planning; the same object when none changed. */
  players: AiPlayers;
}

/** `after`, or `before` itself when they say the same. */
const unchangedOr = (before: AiState, after: AiState) =>
  before.dangers === after.dangers &&
  before.deposits === after.deposits &&
  before.builtAt === after.builtAt &&
  before.noRoom === after.noRoom &&
  before.search === after.search &&
  before.goal?.building === after.goal?.building &&
  before.goal?.waiting === after.goal?.waiting
    ? before
    : after;

/** One computer player's decision: what it learns, plans and orders. */
function decide(ctx: SimContext, state: GameState, player: PlayerId, ai: AiState) {
  const knowledge = aiKnowledge(ctx, state, player);
  const difficulty = AI_DIFFICULTIES[ai.difficulty];
  const input: ManagerInput = {
    knowledge,
    memory: observe(ai, knowledge),
    personality: AI_PERSONALITIES[ai.personality],
    difficulty,
    rng: aiRng(ai, state.tick),
    findSpot: (building, options, from) =>
      searchBuildingSpot(ctx, state, player, building, options, from, SPOT_RULES.perDecision),
    claimed: new Set(),
  };
  // Managers in order of importance; the base one's plan also guides the gathering.
  const base = manageBase(input);
  const memory: AiState = { ...input.memory, ...base.memory };
  const economy = manageEconomy({ ...input, memory });
  const proposals = [...base.proposals, ...economy];
  const commands = proposals
    .slice(0, difficulty.commandsPerThink)
    .map(({ command, note }): AiCommand => ({ issuer: player, command, note }));
  // A building that didn't fit under the command cap is not started: forget that it was.
  if (proposals.findIndex((p) => p.command.type === 'placeBuilding') >= commands.length) {
    memory.builtAt = ai.builtAt;
  }
  return { commands, memory: unchangedOr(ai, memory) };
}

/**
 * The AI phase of a tick: every computer player whose turn it is (and whose game isn't
 * decided) looks at the state as the tick begins, updates what it remembers and gives its
 * commands, in seat order. They are ordinary commands: `stepGame` validates and applies
 * them like a human's, after the humans'. Managers are asked in order of importance, and
 * the difficulty caps how many commands get through. `ctx` must be synced with `state`.
 */
export function thinkAi(ctx: SimContext, state: GameState): AiThoughts {
  const due = Object.entries(state.ai)
    .filter(([player, ai]) => isThinkTick(ai, state.tick) && !state.outcome[player])
    .sort(([, a], [, b]) => a.order - b.order);
  let players = state.ai;
  const commands = due.flatMap(([player, ai]) => {
    const decision = decide(ctx, state, player, ai);
    if (decision.memory !== ai) players = { ...players, [player]: decision.memory };
    return decision.commands;
  });
  return { commands, players };
}

/**
 * `players` with this tick's commands and how they went added to each one's log. The same
 * object when nothing was commanded.
 */
export function recordDecisions(
  players: AiPlayers,
  tick: number,
  given: readonly { issuer: PlayerId; note: string; result: CommandResult }[],
): AiPlayers {
  if (given.length === 0) return players;
  const next = { ...players };
  for (const { issuer, note, result } of given) {
    const ai = next[issuer];
    if (!ai) continue;
    const decision: AiDecision = {
      tick,
      note,
      ...(result.ok ? {} : { refused: result.check.issues }),
    };
    next[issuer] = { ...ai, log: [...ai.log, decision].slice(-AI_LOG_LENGTH) };
  }
  return next;
}
