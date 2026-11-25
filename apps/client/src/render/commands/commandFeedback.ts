import type { BuildingInstance } from '@roe/sim';

/** A command the player just gave, to be acknowledged visually. */
export type CommandFeedback =
  /** A move, or with `attack` an attack or attack-move (drawn in red). */
  | { kind: 'move'; x: number; y: number; z: number; attack?: boolean }
  | { kind: 'build'; site: BuildingInstance; groundY: number };

const queue: CommandFeedback[] = [];

/**
 * Hand-off from input handlers to `CommandMarkers`: input pushes, the marker renderer
 * drains the queue in its next frame. A plain module, so no React state changes.
 */
export const commandFeedback = {
  push(event: CommandFeedback) {
    // A burst of clicks in one frame never needs more than a handful of markers.
    if (queue.length < 16) queue.push(event);
  },
  drain(handle: (event: CommandFeedback) => void) {
    for (const event of queue) handle(event);
    queue.length = 0;
  },
};
