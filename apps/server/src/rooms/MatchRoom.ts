import { Room, type Client } from '@colyseus/core';
import { PROTOTYPE_MAP, PROTOTYPE_SETTLEMENT } from '@roe/game-data';
import { MAX_PLAYERS } from '@roe/shared';
import {
  applyCommand,
  createInitialState,
  createWorld,
  parseCommand,
  type GameState,
  type SimWorld,
} from '@roe/sim';
import { MatchState, PlayerState, type MatchStateInstance } from './MatchState.js';

/** The world is static and deterministic, so all rooms on this map share one instance. */
let sharedWorld: SimWorld | undefined;
const getWorld = () => (sharedWorld ??= createWorld(PROTOTYPE_MAP, PROTOTYPE_SETTLEMENT));

/**
 * Match room. Commands from clients are validated with exactly the same `@roe/sim`
 * rules the client preview uses. The issuing player is always the network session,
 * never a value from the message. (Syncing the game state to clients comes with the
 * multiplayer phase; for now the server keeps it privately and replies with the result.)
 */
export class MatchRoom extends Room<{ state: MatchStateInstance }> {
  override maxClients = MAX_PLAYERS;
  override state = new MatchState({ mapId: PROTOTYPE_MAP.id });
  private world = getWorld();
  private game: GameState = createInitialState(this.world);

  override onCreate(): void {
    this.onMessage('command', (client: Client, message: unknown) => {
      const command = parseCommand(message);
      if (!command) {
        client.send('commandResult', { ok: false, issues: ['malformed'] });
        return;
      }
      const result = applyCommand(this.world, this.game, client.sessionId, command);
      this.game = result.state;
      client.send(
        'commandResult',
        result.ok ? { ok: true } : { ok: false, issues: result.check.issues },
      );
    });
  }

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
