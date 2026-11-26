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
  /**
   * Optional clip played right after this one, joined into one clip at load time (the
   * archer's draw, then release).
   */
  then?: { file: string; clip: string };
}

/** What a unit's visible activity looks like. Keys are referenced by the renderer. */
export type CharacterAnimation =
  | 'idle'
  | 'walk'
  | 'build'
  | 'chop'
  | 'mine'
  /** Farming: sowing a plot (scattering seed) and reaping it (with a sickle). */
  | 'sow'
  | 'reap'
  /** Walking with a load held in both arms. */
  | 'carry'
  /** Standing with a load held in both arms. */
  | 'hold'
  /** Falling down; played once, the last frame held. */
  | 'death';

/** One swatch of a character's texture atlas: [column, row], row 0 at the top. */
export type AtlasCell = readonly [number, number];

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
  /**
   * Recolored areas of the texture atlas (KayKit characters use an 8 × 4 grid of color
   * swatches, the same layout for every Adventurer). `team` cells take the owner's color,
   * `profession` cells the profession's tunic color, both keeping the swatch's shading.
   */
  tint: {
    grid: readonly [number, number];
    team: readonly AtlasCell[];
    profession: readonly AtlasCell[];
  };
  /** Bone that hats follow; hats sit on top of the vertices skinned to it. */
  headBone: string;
  /** Bone that tools are held by (KayKit accessories are modelled in its frame). */
  toolBone: string;
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

/** Clips shared by every villager (all Adventurers use the same Rig_Medium skeleton). */
const VILLAGER_ANIMATIONS = {
  idle: { file: `${MEDIUM}Rig_Medium_General.glb`, clip: 'Idle_A' },
  // The walk with the longest stride: ~1.07 model units per 1.07 s cycle, i.e. ~0.62
  // world units/s at this scale. The renderer speeds it up to the serf's walking speed
  // from the measured stride, so the feet stay planted.
  walk: { file: `${MEDIUM}Rig_Medium_MovementBasic.glb`, clip: 'Walking_B' },
  build: { file: `${MEDIUM}Rig_Medium_Tools.glb`, clip: 'Hammering' },
  // Gathering: chopping trees and quarrying rocks.
  chop: { file: `${MEDIUM}Rig_Medium_Tools.glb`, clip: 'Chopping' },
  mine: { file: `${MEDIUM}Rig_Medium_Tools.glb`, clip: 'Pickaxing' },
  // Farming: a low working motion for sowing, a sweeping one for reaping.
  sow: { file: `${MEDIUM}Rig_Medium_Tools.glb`, clip: 'Working_A' },
  reap: { file: `${MEDIUM}Rig_Medium_Tools.glb`, clip: 'Working_B' },
  // No carry walk in the pack: the walk's legs with Holding_A's arms (both forearms
  // forward at waist height, like holding a box). Stride, and so playback rate,
  // stay the walk's.
  carry: {
    file: `${MEDIUM}Rig_Medium_MovementBasic.glb`,
    clip: 'Walking_B',
    upperBody: { file: `${MEDIUM}Rig_Medium_Tools.glb`, clip: 'Holding_A' },
  },
  hold: { file: `${MEDIUM}Rig_Medium_Tools.glb`, clip: 'Holding_A' },
  death: { file: `${MEDIUM}Rig_Medium_General.glb`, clip: 'Death_A' },
} as const satisfies Record<CharacterAnimation, AnimationClipRef>;

/** What a soldier's visible activity looks like. Keys are referenced by the renderer. */
export type SoldierAnimation =
  | 'idle'
  | 'walk'
  /** One attack (swing, thrust, or draw and release), played once per attack. */
  | 'attack'
  /** Between attacks, once the attack clip has ended: a guard or aiming stance. */
  | 'ready'
  | 'death';

/** Weapons and gear soldiers hold or wear (files in `CHARACTER_PACK.weapons`; the spear is built in code). */
export type WeaponId =
  | 'sword'
  | 'shield'
  | 'spear'
  | 'bow'
  | 'quiver'
  | 'skeletonBlade'
  | 'skeletonAxe'
  | 'skeletonShield'
  | 'crossbow'
  /** Heroes' gear: the two-handed sword, the staff and the Pathfinder's crossbow. */
  | 'greatsword'
  | 'staff'
  | 'heroCrossbow';

export interface SoldierModel {
  /** Model file relative to `CHARACTER_PACK.dir`. */
  model: string;
  hiddenMeshes: readonly string[];
  /** Model units → world units. */
  scale: number;
  /** Standing height in model units. */
  height: number;
  animations: Readonly<Record<SoldierAnimation, AnimationClipRef>>;
  /**
   * Seconds into the `attack` clip where the blow lands or the arrow leaves. The renderer
   * plays the clip so that this moment meets the simulation's strike (the attack's
   * `windup`).
   */
  attackHitAt: number;
  /** Atlas cells in the owner's color (see `CharacterModel.tint`). */
  tint: { grid: readonly [number, number]; team: readonly AtlasCell[] };
  /** Gear on bones: weapons in the hand slots (in that bone's frame), a quiver on the back. */
  weapons: readonly { weapon: WeaponId; bone: string }[];
}

const MELEE = `${MEDIUM}Rig_Medium_CombatMelee.glb`;
const RANGED = `${MEDIUM}Rig_Medium_CombatRanged.glb`;
const GENERAL = `${MEDIUM}Rig_Medium_General.glb`;
const SPECIAL = `${MEDIUM}Rig_Medium_Special.glb`;
const WALK = { file: `${MEDIUM}Rig_Medium_MovementBasic.glb`, clip: 'Walking_B' };
const DEATH = { file: GENERAL, clip: 'Death_A' };

/** Soldiers stand a bit taller than villagers (1.15×), so they read at RTS zoom. */
const SOLDIER_SCALE = 0.71;
/** Heroes stand out by size: 1.2× a soldier. */
const HERO_SCALE = SOLDIER_SCALE * 1.2;

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
    animations: VILLAGER_ANIMATIONS,
    carryAttach: { bone: 'chest', hands: ['handslot.l', 'handslot.r'] },
    // The blue scarf and tunic trim.
    tint: {
      grid: [8, 4],
      team: [
        [0, 1],
        [1, 2],
      ],
      profession: [],
    },
    headBone: 'head',
    toolBone: 'handslot.r',
  } satisfies CharacterModel,
  worker: {
    // The Rogue without cape (bare-headed, long hair): reads differently from the serfs,
    // and the profession's hat sits on the head.
    model: 'adventurers/Rogue.glb',
    hiddenMeshes: ['Rogue_Cape'],
    // Same rig and proportions as the serf.
    scale: 0.62,
    height: 2.3,
    animations: VILLAGER_ANIMATIONS,
    carryAttach: { bone: 'chest', hands: ['handslot.l', 'handslot.r'] },
    // Bright green neckerchief and cuffs: player color; dark teal tunic: profession.
    tint: {
      grid: [8, 4],
      team: [
        [1, 1],
        [1, 2],
      ],
      profession: [[0, 1]],
    },
    headBone: 'head',
    toolBone: 'handslot.r',
  } satisfies CharacterModel,
  /** Tools held while working (KayKit Adventurers accessories, packed to GLB). */
  accessories: {
    axe: 'accessories/axe_1handed.glb',
  },
  /** Soldiers' gear (KayKit Adventurers accessories, packed to GLB). */
  weapons: {
    sword: 'accessories/sword_1handed.glb',
    shield: 'accessories/shield_badge_color.glb',
    bow: 'accessories/bow_withString.glb',
    quiver: 'accessories/quiver.glb',
    // KayKit Skeletons 1.1 accessories.
    skeletonBlade: 'accessories/Skeleton_Blade.glb',
    skeletonAxe: 'accessories/Skeleton_Axe.glb',
    skeletonShield: 'accessories/Skeleton_Shield_Small_A.glb',
    crossbow: 'accessories/Skeleton_Crossbow.glb',
    greatsword: 'accessories/sword_2handed.glb',
    staff: 'accessories/staff.glb',
    heroCrossbow: 'accessories/crossbow_2handed.glb',
  } as Readonly<Partial<Record<WeaponId, string>>>,
  /** The arrow drawn in flight. */
  arrow: 'accessories/arrow_bow.glb',
  soldiers: {
    // The Knight: plate armor, helmet with visor, sword and shield; red cape and tabard
    // take the player color.
    swordsman: {
      model: 'adventurers/Knight.glb',
      hiddenMeshes: [],
      scale: SOLDIER_SCALE,
      height: 2.4,
      animations: {
        idle: { file: GENERAL, clip: 'Idle_A' },
        walk: WALK,
        attack: { file: MELEE, clip: 'Melee_1H_Attack_Chop' },
        ready: { file: MELEE, clip: 'Melee_Blocking' },
        death: DEATH,
      },
      attackHitAt: 0.45,
      tint: { grid: [8, 4], team: [[0, 1]] },
      weapons: [
        { weapon: 'sword', bone: 'handslot.r' },
        { weapon: 'shield', bone: 'handslot.l' },
      ],
    },
    // The Barbarian with a long spear held in both hands: a bulky, bear-hatted silhouette
    // unlike any other unit. The waist wrap and bracers ([6, 0]) and their trim ([2, 1])
    // take the player color.
    spearman: {
      model: 'adventurers/Barbarian.glb',
      hiddenMeshes: [],
      scale: SOLDIER_SCALE,
      height: 2.4,
      animations: {
        idle: { file: MELEE, clip: 'Melee_2H_Idle' },
        walk: WALK,
        attack: { file: MELEE, clip: 'Melee_2H_Attack_Stab' },
        ready: { file: MELEE, clip: 'Melee_2H_Idle' },
        death: DEATH,
      },
      attackHitAt: 0.6,
      tint: {
        grid: [8, 4],
        team: [
          [2, 1],
          [6, 0],
        ],
      },
      weapons: [{ weapon: 'spear', bone: 'handslot.r' }],
    },
    // The hooded Rogue with bow and quiver; hood and cape take the player color. Not the
    // Ranger: serfs are Rangers, and archers must not be mistaken for them.
    archer: {
      model: 'adventurers/Rogue_Hooded.glb',
      hiddenMeshes: [],
      scale: SOLDIER_SCALE,
      height: 2.3,
      animations: {
        // Not the pack's Ranged_Bow_Idle: it hardly moves the head (~1/5 of Idle_A) while
        // the bow arm drifts, which at RTS zoom is sub-pixel creeping, not breathing. Its
        // keys, bake and playback are smooth; the motion is just too small to read.
        idle: { file: GENERAL, clip: 'Idle_A' },
        walk: WALK,
        attack: {
          file: RANGED,
          clip: 'Ranged_Bow_Draw',
          then: { file: RANGED, clip: 'Ranged_Bow_Release' },
        },
        ready: { file: RANGED, clip: 'Ranged_Bow_Aiming_Idle' },
        death: DEATH,
      },
      // The string leaves the hand just after the release clip starts.
      attackHitAt: 1.43,
      tint: { grid: [8, 4], team: [[1, 1]] },
      weapons: [
        { weapon: 'bow', bone: 'handslot.l' },
        { weapon: 'quiver', bone: 'chest' },
      ],
    },
  } satisfies Record<'swordsman' | 'spearman' | 'archer', SoldierModel>,
  /**
   * Heroes: Adventurers at 1.2× a soldier's size with their own gear, over a golden
   * ring (client). Cloth that the soldiers tint takes the owner's color here too.
   */
  heroes: {
    // The Knight with a two-handed sword.
    commander: {
      model: 'adventurers/Knight.glb',
      hiddenMeshes: [],
      scale: HERO_SCALE,
      height: 2.4,
      animations: {
        idle: { file: MELEE, clip: 'Melee_2H_Idle' },
        walk: WALK,
        attack: { file: MELEE, clip: 'Melee_2H_Attack_Chop' },
        ready: { file: MELEE, clip: 'Melee_2H_Idle' },
        death: DEATH,
      },
      attackHitAt: 0.7,
      tint: { grid: [8, 4], team: [[0, 1]] },
      weapons: [{ weapon: 'greatsword', bone: 'handslot.r' }],
    },
    // The Mage with a staff; no other unit uses this model.
    archmage: {
      model: 'adventurers/Mage.glb',
      hiddenMeshes: [],
      scale: HERO_SCALE,
      height: 2.6,
      animations: {
        idle: { file: GENERAL, clip: 'Idle_A' },
        walk: WALK,
        attack: { file: RANGED, clip: 'Ranged_Magic_Shoot' },
        ready: { file: GENERAL, clip: 'Idle_A' },
        death: DEATH,
      },
      attackHitAt: 0.35,
      tint: { grid: [8, 4], team: [] },
      weapons: [{ weapon: 'staff', bone: 'handslot.r' }],
    },
    // The Ranger (as drawn for serfs, but with cape and quiver) with a crossbow.
    pathfinder: {
      model: 'adventurers/Ranger.glb',
      hiddenMeshes: [],
      scale: HERO_SCALE,
      height: 2.3,
      animations: {
        idle: { file: GENERAL, clip: 'Idle_A' },
        walk: WALK,
        attack: { file: RANGED, clip: 'Ranged_2H_Shoot' },
        ready: { file: RANGED, clip: 'Ranged_2H_Aiming' },
        death: DEATH,
      },
      attackHitAt: 0.2,
      tint: { grid: [8, 4], team: [[0, 1]] },
      weapons: [{ weapon: 'heroCrossbow', bone: 'handslot.r' }],
    },
  } satisfies Record<'commander' | 'archmage' | 'pathfinder', SoldierModel>,
  /**
   * KayKit Character Pack: Skeletons 1.1 (CC0, Kay Lousberg), on the same Rig_Medium (same
   * 23 bones and rest pose as the Adventurers, checked when importing), so every clip
   * plays on them. Monsters keep their own colors (no team cells).
   */
  monsters: {
    skeletonMinion: {
      model: 'skeletons/Skeleton_Minion.glb',
      hiddenMeshes: [],
      scale: SOLDIER_SCALE,
      height: 2.2,
      animations: {
        idle: { file: SPECIAL, clip: 'Skeletons_Idle' },
        walk: { file: SPECIAL, clip: 'Skeletons_Walking' },
        attack: { file: MELEE, clip: 'Melee_1H_Attack_Slice_Diagonal' },
        ready: { file: SPECIAL, clip: 'Skeletons_Taunt' },
        death: { file: SPECIAL, clip: 'Skeletons_Death' },
      },
      attackHitAt: 0.45,
      tint: { grid: [8, 4], team: [] },
      weapons: [{ weapon: 'skeletonBlade', bone: 'handslot.r' }],
    },
    skeletonWarrior: {
      model: 'skeletons/Skeleton_Warrior.glb',
      hiddenMeshes: [],
      scale: SOLDIER_SCALE,
      height: 2.4,
      animations: {
        idle: { file: SPECIAL, clip: 'Skeletons_Idle' },
        walk: { file: SPECIAL, clip: 'Skeletons_Walking' },
        attack: { file: MELEE, clip: 'Melee_1H_Attack_Chop' },
        ready: { file: MELEE, clip: 'Melee_Blocking' },
        death: { file: SPECIAL, clip: 'Skeletons_Death' },
      },
      attackHitAt: 0.45,
      tint: { grid: [8, 4], team: [] },
      weapons: [
        { weapon: 'skeletonAxe', bone: 'handslot.r' },
        { weapon: 'skeletonShield', bone: 'handslot.l' },
      ],
    },
    skeletonArcher: {
      model: 'skeletons/Skeleton_Rogue.glb',
      hiddenMeshes: [],
      scale: SOLDIER_SCALE,
      height: 2.3,
      animations: {
        idle: { file: SPECIAL, clip: 'Skeletons_Idle' },
        walk: { file: SPECIAL, clip: 'Skeletons_Walking' },
        attack: { file: RANGED, clip: 'Ranged_2H_Shoot' },
        ready: { file: RANGED, clip: 'Ranged_2H_Aiming' },
        death: { file: SPECIAL, clip: 'Skeletons_Death' },
      },
      // The bolt leaves as the shoot clip kicks back.
      attackHitAt: 0.2,
      tint: { grid: [8, 4], team: [] },
      weapons: [{ weapon: 'crossbow', bone: 'handslot.r' }],
    },
  } satisfies Record<'skeletonMinion' | 'skeletonWarrior' | 'skeletonArcher', SoldierModel>,
} as const;
