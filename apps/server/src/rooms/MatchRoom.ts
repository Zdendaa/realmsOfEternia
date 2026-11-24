import { Room, type Client } from '@colyseus/core';
import { PROTOTYPE_MAP, PROTOTYPE_SETTLEMENT } from '@roe/game-data';
import { MAX_PLAYERS, SIMULATION_TICK_MS } from '@roe/shared';
import {
  createInitialState,
  createSimContext,
  createWorld,
  parseCommand,
  stepGame,
  type GameState,
  type IssuedCommand,
  type SimContext,
  type SimWorld,
} from '@roe/sim';
import { MatchState, PlayerState, type MatchStateInstance } from './MatchState.js';

/** The world is static and deterministic, so all rooms on this map share one instance. */
let sharedWorld: SimWorld | undefined;
const getWorld = () => (sharedWorld ??= createWorld(PROTOTYPE_MAP, PROTOTYPE_SETTLEMENT));

interface QueuedCommand extends IssuedCommand {
  client: Client;
}

/**
 * Match room. Runs the shared `@roe/sim` tick at `SIMULATION_TICK_RATE`. Commands from
 * clients are parsed, queued and applied at the start of the next tick, in arrival order,
 * with the issuer always taken from the network session, never from the message.
 * (Syncing the game state to clients comes with the multiplayer phase; for now the
 * server keeps it privately and replies with each command's result.)
 */
export class MatchRoom extends Room<{ state: MatchStateInstance }> {
  override maxClients = MAX_PLAYERS;
  override state = new MatchState({ mapId: PROTOTYPE_MAP.id });
  private world = getWorld();
  // The starting settlement stays neutral until matches have start positions.
  private game: GameState = createInitialState(this.world);
  private ctx: SimContext = createSimContext(this.world, this.game);
  private queue: QueuedCommand[] = [];

  override onCreate(): void {
    this.onMessage('command', (client: Client, message: unknown) => {
      const command = parseCommand(message);
      if (!command) {
        client.send('commandResult', { ok: false, issues: ['malformed'] });
        return;
      }
      this.queue.push({ client, issuer: client.sessionId, command });
    });
    this.setSimulationInterval(() => this.tick(), SIMULATION_TICK_MS);
  }

  private tick(): void {
    const queued = this.queue;
    this.queue = [];
    const { state, results } = stepGame(this.ctx, this.game, queued);
    this.game = state;
    results.forEach((result, i) => {
      const { client } = queued[i] as QueuedCommand;
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
