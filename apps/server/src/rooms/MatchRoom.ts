import { Room, type Client } from '@colyseus/core';
import { PROTOTYPE_MAP } from '@roe/game-data';
import { MAX_PLAYERS } from '@roe/shared';
import { MatchState, PlayerState, type MatchStateInstance } from './MatchState.js';

/**
 * Placeholder match room. Real gameplay commands will be received here,
 * validated against the rules in `@roe/shared`, and applied to the state.
 */
export class MatchRoom extends Room<{ state: MatchStateInstance }> {
  override maxClients = MAX_PLAYERS;
  override state = new MatchState({ mapId: PROTOTYPE_MAP.id });

  override onJoin(client: Client): void {
    const playerNumber = this.state.players.size + 1;
    this.state.players.set(
      client.sessionId,
      new PlayerState({ name: `Player ${playerNumber}`, ready: false }),
    );
    console.log(`[match ${this.roomId}] ${client.sessionId} joined`);
  }

  override onLeave(client: Client): void {
    this.state.players.delete(client.sessionId);
    console.log(`[match ${this.roomId}] ${client.sessionId} left`);
  }
}
