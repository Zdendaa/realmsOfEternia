/** One animation clip inside an animation library file. */
export interface AnimationClipRef {
  /** File relative to `CHARACTER_PACK.dir`. */
  file: string;
  /** Clip name inside the file. */
  clip: string;
  /**
   * Optional second clip for the upper body (`RIG_MEDIUM.upperBody` bones): the result
   * keeps this clip's legs and hips and takes the arms, spine and head from the other.
   * Used for carrying: a walk with the arms of a holding pose.
   */
  upperBody?: { file: string; clip: string };
}

/** What a unit's visible activity looks like. Keys are referenced by the renderer. */
export type CharacterAnimation =
  | 'idle'
  | 'walk'
  | 'build'
  | 'chop'
  | 'mine'
  /** Walking with a load held in both arms. */
  | 'carry'
  /** Standing with a load held in both arms. */
  | 'hold';

export interface CharacterModel {
  /** Model file relative to `CHARACTER_PACK.dir`. */
  model: string;
  /** Meshes hidden for this role (accessories that don't fit it). */
  hiddenMeshes: readonly string[];
  /** Model units → world units. */
  scale: number;
  /** Standing height in model units (world height = height · scale). */
  height: number;
  animations: Readonly<Record<CharacterAnimation, AnimationClipRef>>;
  /**
   * Where carried goods sit: rigidly on `bone`, centered between the two `hands` bones
   * as they are posed in the `carry` clip.
   */
  carryAttach: { bone: string; hands: readonly [string, string] };
}

/** Bone groups of the KayKit Rig_Medium skeleton (names as in the GLB files). */
export const RIG_MEDIUM = {
  upperBody: [
    'spine',
    'chest',
    'head',
    'upperarm.l',
    'lowerarm.l',
    'wrist.l',
    'hand.l',
    'handslot.l',
    'upperarm.r',
    'lowerarm.r',
    'wrist.r',
    'hand.r',
    'handslot.r',
  ],
} as const;

const MEDIUM = 'animations/Rig_Medium/';

/**
 * KayKit Adventurers 2.0 (FREE) characters with KayKit Character Animations 1.1, both
 * CC0 by Kay Lousberg. Files live in apps/client/public/assets/models/characters/.
 * All Adventurers characters use the Rig_Medium skeleton, so every Rig_Medium clip plays
 * on every character (same 23 bone names and rest pose, checked when importing).
 */
export const CHARACTER_PACK = {
  dir: 'assets/models/characters/',
  /** Animation clips are sampled at this rate when baked for instancing. */
  bakeFps: 30,
  serf: {
    // The Ranger without cape and quiver reads as a villager: tunic, belt, boots, and a
    // blue scarf that the renderer recolors per player.
    model: 'adventurers/Ranger.glb',
    hiddenMeshes: ['Ranger_Cape', 'Ranger_Quiver'],
    // ~2.3 model units tall → ~1.4 world units, matching the medieval buildings.
    scale: 0.62,
    height: 2.3,
    animations: {
      idle: { file: `${MEDIUM}Rig_Medium_General.glb`, clip: 'Idle_A' },
      // The walk with the longest stride: ~1.07 model units per 1.07 s cycle, i.e. ~0.62
      // world units/s at this scale. The renderer speeds it up to the serf's walking speed
      // from the measured stride, so the feet stay planted.
      walk: { file: `${MEDIUM}Rig_Medium_MovementBasic.glb`, clip: 'Walking_B' },
      build: { file: `${MEDIUM}Rig_Medium_Tools.glb`, clip: 'Hammering' },
      // Gathering: chopping trees and quarrying rocks.
      chop: { file: `${MEDIUM}Rig_Medium_Tools.glb`, clip: 'Chopping' },
      mine: { file: `${MEDIUM}Rig_Medium_Tools.glb`, clip: 'Pickaxing' },
      // No carry walk in the pack: the walk's legs with Holding_A's arms (both forearms
      // forward at waist height, like holding a box). Stride, and so playback rate,
      // stay the walk's.
      carry: {
        file: `${MEDIUM}Rig_Medium_MovementBasic.glb`,
        clip: 'Walking_B',
        upperBody: { file: `${MEDIUM}Rig_Medium_Tools.glb`, clip: 'Holding_A' },
      },
      hold: { file: `${MEDIUM}Rig_Medium_Tools.glb`, clip: 'Holding_A' },
    },
    carryAttach: { bone: 'chest', hands: ['handslot.l', 'handslot.r'] },
  } satisfies CharacterModel,
} as const;
