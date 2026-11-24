import { PROTOTYPE_MAP, PROTOTYPE_SETTLEMENT } from '@roe/game-data';
import type { HeightField, PlayerId } from '@roe/shared';
import {
  applyCommand,
  createInitialState,
  createSimContext,
  createWorld,
  syncContext,
  type Command,
  type CommandResult,
  type GameState,
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
 * Simulation state on the client. `dispatch` runs exactly the same validation and
 * reducer the server will run; later it will also send the command to the server.
 */
interface GameStore {
  world: SimWorld;
  /** Derived caches (flattened terrain, nav grid), kept in sync with `state`. */
  ctx: SimContext;
  state: GameState;
  /** Terrain flattened under every building in `state`. Replaced when buildings change. */
  heights: HeightField;
  dispatch: (command: Command) => CommandResult;
}

const world = createWorld(PROTOTYPE_MAP, PROTOTYPE_SETTLEMENT);
// Single player for now: the starting settlement belongs to the local player.
const initialState = createInitialState(world, { owner: LOCAL_PLAYER });
const ctx = createSimContext(world, initialState);

export const useGameStore = create<GameStore>()((set, get) => ({
  world,
  ctx,
  state: initialState,
  heights: ctx.heights,
  dispatch: (command) => {
    const result = applyCommand(ctx, get().state, LOCAL_PLAYER, command);
    if (result.ok) {
      syncContext(ctx, result.state);
      set({ state: result.state, heights: ctx.heights });
    }
    return result;
  },
}));
