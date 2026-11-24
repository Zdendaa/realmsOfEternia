/**
 * Where rendering is between two simulation ticks: 0 = the previous state, 1 = the
 * current one. Written by `SimulationDriver` every frame, read by interpolating renderers.
 * A plain module value, not React state: it changes every frame.
 */
export const simClock = {
  alpha: 0,
  /** Seconds of real time rendered so far; drives procedural animation. */
  time: 0,
};
