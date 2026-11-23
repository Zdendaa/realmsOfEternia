/** Fixed simulation rate shared by client prediction and the authoritative server. */
export const SIMULATION_TICK_RATE = 20;

/** Milliseconds per simulation tick. */
export const SIMULATION_TICK_MS = 1000 / SIMULATION_TICK_RATE;

/** Supported number of players in a match. */
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
