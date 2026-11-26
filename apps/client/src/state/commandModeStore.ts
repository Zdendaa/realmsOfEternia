import type { AbilityId } from '@roe/game-data';
import type { EntityId } from '@roe/shared';
import { create } from 'zustand';

/** A hero's ability waiting for its target. */
export interface AbilityAim {
  unitId: EntityId;
  ability: AbilityId;
}

/** What the target under the mouse is worth: castable, or why not. */
export interface AimFeedback {
  ok: boolean;
  /** Why a click wouldn't cast, in words; null when it would. */
  problem: string | null;
}

/**
 * A pending unit command that waits for a target click (UI-only, never sent):
 * attack-move (F) waits for a point or an enemy, an aimed ability for its target.
 * Esc or a right click cancels either.
 */
interface CommandModeState {
  mode: 'attackMove' | 'ability' | null;
  /** The ability being aimed, while `mode` is 'ability'. */
  aim: AbilityAim | null;
  /** About the target under the mouse; null while the mouse is off the ground. */
  feedback: AimFeedback | null;
  setMode: (mode: 'attackMove' | null) => void;
  startAim: (aim: AbilityAim) => void;
  setFeedback: (feedback: AimFeedback | null) => void;
}

export const useCommandModeStore = create<CommandModeState>()((set, get) => ({
  mode: null,
  aim: null,
  feedback: null,
  setMode: (mode) => set({ mode, aim: null, feedback: null }),
  startAim: (aim) => set({ mode: 'ability', aim, feedback: null }),
  setFeedback: (feedback) => {
    // Written every frame: only a change is published.
    const current = get().feedback;
    if (current?.ok === feedback?.ok && current?.problem === feedback?.problem) return;
    set({ feedback });
  },
}));
