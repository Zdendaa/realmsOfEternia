import type { UnitActivity } from '@roe/sim';

export interface Pose {
  /** Vertical bounce, world units. */
  lift: number;
  /** Lean around the local X axis (forward), radians. */
  pitch: number;
  /** Sideways sway around the local Z axis, radians. */
  roll: number;
}

const WALK_RATE = 9; // steps per second × 2π-ish
const WORK_RATE = 6;

/**
 * Procedural placeholder animation: walking bobs and sways, working swings forward and
 * back like hammering, idle breathes slightly. `phase` desynchronizes units.
 */
export function unitPose(activity: UnitActivity, time: number, phase: number): Pose {
  switch (activity) {
    case 'walking': {
      const t = time * WALK_RATE + phase;
      return { lift: Math.abs(Math.sin(t)) * 0.07, pitch: 0.08, roll: Math.sin(t) * 0.06 };
    }
    case 'working':
    case 'casting':
    case 'attacking': {
      const t = time * WORK_RATE + phase;
      const swing = Math.max(0, Math.sin(t));
      return { lift: 0, pitch: 0.1 + swing * swing * 0.45, roll: 0 };
    }
    case 'dying':
      return { lift: 0, pitch: 1.4, roll: 0 };
    case 'idle':
      return { lift: Math.sin(time * 1.5 + phase) * 0.008, pitch: 0, roll: 0 };
  }
}
