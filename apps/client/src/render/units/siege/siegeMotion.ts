/**
 * How the siege engines move in an attack, from the seconds since it started, timed so
 * the blow or the release falls on the simulation's strike (`windup`).
 */

/** The catapult's arm cranks down this far (radians), then swings up to `ARM_UP`. */
const ARM_BACK = -0.12;
const ARM_UP = 1.75;
const SWING_TIME = 0.22;
const HOLD_TIME = 0.5;
const LOWER_TIME = 2.3;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);

export interface ArmPose {
  /** Rotation of the arm about its pivot (radians; 0 = at rest, positive = thrown). */
  angle: number;
  /** A rock lies in the bucket. */
  loaded: boolean;
}

export function catapultArm(elapsed: number | null, windup: number): ArmPose {
  if (elapsed === null) return { angle: 0, loaded: true };
  const release = elapsed - windup;
  if (release < -SWING_TIME) {
    return { angle: ARM_BACK * (elapsed / (windup - SWING_TIME)), loaded: true };
  }
  if (release < 0) {
    // Speeding up into the release.
    const t = 1 + release / SWING_TIME;
    return { angle: lerp(ARM_BACK, ARM_UP, t * t), loaded: true };
  }
  if (release < HOLD_TIME) return { angle: ARM_UP, loaded: false };
  const lowered = (release - HOLD_TIME) / LOWER_TIME;
  if (lowered < 1) return { angle: ARM_UP * (1 - smooth(lowered)), loaded: false };
  return { angle: 0, loaded: true };
}

/** How far (world units, along the engine) the ram's log is from where it hangs. */
const PULL = -0.55;
const PUNCH = 0.5;
const RECOVER_TIME = 0.6;

export function ramSwing(elapsed: number | null, windup: number): number {
  if (elapsed === null) return 0;
  const drawn = windup * 0.75;
  if (elapsed < drawn) return PULL * smooth(elapsed / drawn);
  if (elapsed < windup) {
    const t = (elapsed - drawn) / (windup - drawn);
    return lerp(PULL, PUNCH, t * t);
  }
  const back = (elapsed - windup) / RECOVER_TIME;
  return back < 1 ? PUNCH * (1 - smooth(back)) : 0;
}
