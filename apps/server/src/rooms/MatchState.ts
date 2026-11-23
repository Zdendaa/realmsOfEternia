import { schema, t } from '@colyseus/schema';

/**
 * Networked state is synchronized to every client automatically by Colyseus.
 * Only the server mutates it; clients send commands and render the result.
 */
export const PlayerState = schema(
  {
    name: t.string(),
    ready: t.boolean(),
  },
  'PlayerState',
);

export const MatchState = schema(
  {
    mapId: t.string(),
    players: t.map(PlayerState),
  },
  'MatchState',
);

export type MatchStateInstance = InstanceType<typeof MatchState>;
