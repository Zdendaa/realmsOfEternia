import { AI_DIFFICULTIES, AI_PERSONALITIES } from '@roe/game-data';
import type { PlayerId } from '@roe/shared';
import type { CommandResult } from '../commands/applyCommand.js';
import type { IssuedCommand } from '../commands/types.js';
import type { SimContext } from '../context/simContext.js';
import type { GameState } from '../state/gameState.js';
import { manageEconomy, type ManagerInput } from './economy.js';
import { aiKnowledge } from './knowledge.js';
import { aiRng, isThinkTick } from './schedule.js';
import { AI_LOG_LENGTH, type AiDecision, type AiPlayers } from './state.js';

/** A command a computer player gives this tick, with why it gives it. */
export interface AiCommand extends IssuedCommand {
  note: string;
}

/**
 * The AI phase of a tick: every computer player whose turn it is (and whose game isn't
 * decided) looks at the state as the tick begins and gives its commands, in seat order.
 * They are ordinary commands: `stepGame` validates and applies them like a human's, after
 * the humans'. Managers are asked in order of importance, and the difficulty caps how
 * many commands get through. `ctx` must be synced with `state`.
 */
export function thinkAi(ctx: SimContext, state: GameState): AiCommand[] {
  const players = Object.entries(state.ai)
    .filter(([player, ai]) => isThinkTick(ai, state.tick) && !state.outcome[player])
    .sort(([, a], [, b]) => a.order - b.order);
  return players.flatMap(([player, ai]) => {
    const input: ManagerInput = {
      knowledge: aiKnowledge(ctx, state, player),
      personality: AI_PERSONALITIES[ai.personality],
      rng: aiRng(ai, state.tick),
    };
    return manageEconomy(input)
      .slice(0, AI_DIFFICULTIES[ai.difficulty].commandsPerThink)
      .map(({ command, note }): AiCommand => ({ issuer: player, command, note }));
  });
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
