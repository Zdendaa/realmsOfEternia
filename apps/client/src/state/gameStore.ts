import { PROTOTYPE_MAP, PROTOTYPE_SETTLEMENT } from '@roe/game-data';
import type { HeightField, PlayerId } from '@roe/shared';
import {
  createInitialState,
  createSimContext,
  createWorld,
  stepGame,
  validateCommand,
  type Command,
  type CommandCheck,
  type GameState,
  type IssuedCommand,
  type SimContext,
  type SimWorld,
} from '@roe/sim';
import { create } from 'zustand';

/**
 * The local player's id. In multiplayer the server attaches the real player from the
 * network session; commands themselves never carry it.
 */
export const LOCAL_PLAYER: PlayerId = 'local';

/**
 * Simulation state on the client. Commands are validated immediately (for UI feedback)
 * and queued; `advance` applies them at the start of the next tick, exactly like the
 * server does. Later `dispatch` will also send the command to the server.
 *
 * The store changes once per tick (10 Hz). Subscribers should select narrowly:
 * `state.buildings` and `heights` keep their references unless buildings change.
 * Per-frame rendering reads the store with `getState()` inside `useFrame`.
 */
interface GameStore {
  world: SimWorld;
  /** Derived caches (flattened terrain, nav grid), kept in sync with `state`. */
  ctx: SimContext;
  state: GameState;
  /** The state one tick earlier; rendering interpolates from it to `state`. */
  previous: GameState;
  /** Terrain flattened under every building in `state`. Replaced when buildings change. */
  heights: HeightField;
  /** Validates and queues a command for the next tick. */
  dispatch: (command: Command) => CommandCheck;
  /** Runs one simulation tick with the queued commands. */
  advance: () => void;
}

const world = createWorld(PROTOTYPE_MAP, PROTOTYPE_SETTLEMENT);
// Single player for now: the starting settlement belongs to the local player.
const initialState = createInitialState(world, { owner: LOCAL_PLAYER });
// Dev builds accept dev-only commands (the spawn panel); production and the server never do.
const ctx = createSimContext(world, initialState, {
  dev: import.meta.env.DEV,
  // The fog of war shows what the local player sees.
  visions: [LOCAL_PLAYER],
});
let queue: IssuedCommand[] = [];

export const useGameStore = create<GameStore>()((set, get) => ({
  world,
  ctx,
  state: initialState,
  previous: initialState,
  heights: ctx.heights,
  dispatch: (command) => {
    const check = validateCommand(ctx, get().state, LOCAL_PLAYER, command);
    if (check.ok) queue.push({ issuer: LOCAL_PLAYER, command });
    return check;
  },
  advance: () => {
    const commands = queue;
    queue = [];
    const previous = get().state;
    const { state } = stepGame(ctx, previous, commands);
    set({ previous, state, heights: ctx.heights });
  },
}));
