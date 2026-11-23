import { PROTOTYPE_MAP, PROTOTYPE_SETTLEMENT } from '@roe/game-data';
import type { HeightField, PlayerId } from '@roe/shared';
import {
  applyCommand,
  createInitialState,
  createStateHeights,
  createWorld,
  type Command,
  type CommandResult,
  type GameState,
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
  state: GameState;
  /** Terrain flattened under every building in `state`. Replaced when buildings change. */
  heights: HeightField;
  dispatch: (command: Command) => CommandResult;
}

const world = createWorld(PROTOTYPE_MAP, PROTOTYPE_SETTLEMENT);

export const useGameStore = create<GameStore>()((set, get) => ({
  world,
  state: createInitialState(world),
  heights: world.heights,
  dispatch: (command) => {
    const { state, heights } = get();
    const result = applyCommand(world, state, LOCAL_PLAYER, command, heights);
    if (result.ok) set({ state: result.state, heights: createStateHeights(world, result.state) });
    return result;
  },
}));
