import type { BuildingId } from '../buildings/definitions.js';
import type { ResourceId } from '../resources/definitions.js';
import type { UnitKind } from '../units/definitions.js';

/**
 * How well and how fast a computer player plays. It never sees or earns more than a
 * human: difficulty only sets how often it acts and how much it does at once.
 */
export interface AiDifficultyDefinition {
  name: string;
  /** Seconds between two of its decisions (a whole number of half seconds). */
  thinkSeconds: number;
  /** The most commands it gives in one decision. */
  commandsPerThink: number;
  /** The share of its personality's serfs it recruits. */
  serfShare: number;
  /** Buildings of its build order it has under construction at once. */
  maxSites: number;
  /** Serfs it puts on one site (never more than the building allows). */
  buildersPerSite: number;
  /** Seconds it lets pass after starting a building before starting the next. */
  buildPauseSeconds: number;
  /** The most soldiers and siege engines it keeps (heroes not counted). */
  maxSoldiers: number;
  /** Units it keeps queued at each training building. */
  queuePerBuilding: number;
  /** It sends no attack on a player before this many seconds (give or take a minute). */
  firstAttackSeconds: number;
  /** Multiplies its personality's attack strength. */
  attackScale: number;
  /** It attacks a camp once it is this many times as strong as it thinks the camp is. */
  campMargin: number;
  /**
   * It calls an attack off when the enemy in sight around it is this many times stronger
   * than what is left of it; null: it never does.
   */
  retreatRatio: number | null;
  /** In a fight it turns everyone on the enemy closest to falling. */
  focusFire: boolean;
  /** It sends soldiers below this share of their health home (0: none). */
  pullBackShare: number;
  /** It trains more of what beats what it has seen of the enemy. */
  countersEnemy: boolean;
}

export const AI_DIFFICULTIES = {
  easy: {
    name: 'Easy',
    thinkSeconds: 3,
    commandsPerThink: 2,
    serfShare: 0.75,
    maxSites: 1,
    buildersPerSite: 2,
    buildPauseSeconds: 45,
    maxSoldiers: 14,
    queuePerBuilding: 1,
    firstAttackSeconds: 840,
    attackScale: 0.7,
    campMargin: 1.35,
    retreatRatio: null,
    focusFire: false,
    pullBackShare: 0,
    countersEnemy: false,
  },
  normal: {
    name: 'Normal',
    thinkSeconds: 1,
    commandsPerThink: 5,
    serfShare: 1,
    maxSites: 2,
    buildersPerSite: 3,
    buildPauseSeconds: 10,
    maxSoldiers: 28,
    queuePerBuilding: 2,
    firstAttackSeconds: 600,
    attackScale: 1,
    campMargin: 1.35,
    retreatRatio: 1.6,
    focusFire: false,
    pullBackShare: 0,
    countersEnemy: false,
  },
  hard: {
    name: 'Hard',
    thinkSeconds: 0.5,
    commandsPerThink: 10,
    serfShare: 1,
    maxSites: 3,
    buildersPerSite: 4,
    buildPauseSeconds: 0,
    maxSoldiers: 40,
    queuePerBuilding: 2,
    firstAttackSeconds: 420,
    attackScale: 1.1,
    campMargin: 1.3,
    retreatRatio: 1.35,
    focusFire: true,
    pullBackShare: 0.3,
    countersEnemy: true,
  },
} as const satisfies Record<string, AiDifficultyDefinition>;

export type AiDifficultyId = keyof typeof AI_DIFFICULTIES;

/** What serfs can gather by hand. */
export type GatheredResource = Extract<ResourceId, 'wood' | 'stone'>;

/** The foot soldiers a computer player trains, and its siege engines. */
export type SoldierKind = Extract<UnitKind, 'swordsman' | 'spearman' | 'archer'>;
export type SiegeKind = Extract<UnitKind, 'ram' | 'catapult'>;

/** What a unit is worth in a fight, as computer players reckon it (at full health). */
export const AI_UNIT_STRENGTH = {
  serf: 0,
  worker: 0,
  swordsman: 12,
  spearman: 9,
  archer: 8,
  ram: 8,
  catapult: 12,
  commander: 32,
  archmage: 26,
  pathfinder: 26,
  skeletonWarrior: 11,
  skeletonMinion: 5,
  skeletonArcher: 8,
} as const satisfies Record<UnitKind, number>;

/** What a computer player prefers to do. */
export interface AiPersonalityDefinition {
  name: string;
  /** Serfs it wants (as far as housing and food allow). */
  serfs: number;
  /** How its gathering serfs are shared out, as weights. */
  gather: Readonly<Record<GatheredResource, number>>;
  /** Stock it likes to have beyond its next building's cost: shortages pull serfs over. */
  reserve: Readonly<Record<GatheredResource, number>>;
  /** How its foot soldiers are shared out, as weights. */
  army: Readonly<Record<SoldierKind, number>>;
  /** Siege engines it builds once it knows of an enemy base. */
  siege: Readonly<Record<SiegeKind, number>>;
  /** Strength (`AI_UNIT_STRENGTH`) it gathers for its first attack on a player... */
  attackStrength: number;
  /** ...and how much more each further one takes. */
  attackGrowth: number;
  /** What it upgrades its towers to, when it can spare it. */
  towerUpgrade: BuildingId | null;
  /**
   * The buildings it wants, most important first. The n-th mention of a building means
   * it wants n of them, so the list includes what the starting village already has, and
   * whatever is destroyed is rebuilt in this order. Houses aren't listed: it builds them
   * whenever housing runs short. Mines wait until it has seen their deposit unguarded.
   */
  buildOrder: readonly BuildingId[];
}

export const AI_PERSONALITIES = {
  balanced: {
    name: 'Balanced',
    serfs: 14,
    gather: { wood: 3, stone: 2 },
    reserve: { wood: 15, stone: 10 },
    army: { swordsman: 3, spearman: 3, archer: 4 },
    siege: { ram: 2, catapult: 1 },
    attackStrength: 130,
    attackGrowth: 30,
    towerUpgrade: null,
    buildOrder: [
      'lumbermill',
      'mill',
      'field',
      'field',
      'bakery',
      'field',
      'quarry',
      'archeryRange',
      'goldMine',
      'ironMine',
      'barracks',
      'storehouse',
      'woodenTower',
      'field',
      'mill',
      'lumbermill',
      'field',
      'bakery',
      'siegeWorkshop',
      'woodenTower',
      'field',
    ],
  },
  aggressive: {
    name: 'Aggressive',
    serfs: 12,
    gather: { wood: 3, stone: 1 },
    reserve: { wood: 20, stone: 8 },
    army: { swordsman: 3, spearman: 4, archer: 3 },
    siege: { ram: 2, catapult: 0 },
    attackStrength: 100,
    attackGrowth: 25,
    towerUpgrade: null,
    buildOrder: [
      'lumbermill',
      'mill',
      'field',
      'field',
      'bakery',
      'archeryRange',
      'ironMine',
      'goldMine',
      'barracks',
      'field',
      'quarry',
      'field',
      'bakery',
      'lumbermill',
      'barracks',
      'storehouse',
      'siegeWorkshop',
    ],
  },
  defensive: {
    name: 'Defensive',
    serfs: 14,
    gather: { wood: 1, stone: 1 },
    reserve: { wood: 15, stone: 20 },
    army: { swordsman: 3, spearman: 2, archer: 5 },
    siege: { ram: 1, catapult: 2 },
    attackStrength: 190,
    attackGrowth: 40,
    towerUpgrade: 'stoneTower',
    buildOrder: [
      'lumbermill',
      'mill',
      'field',
      'field',
      'bakery',
      'quarry',
      'field',
      'archeryRange',
      'woodenTower',
      'storehouse',
      'field',
      'goldMine',
      'ironMine',
      'woodenTower',
      'barracks',
      'field',
      'bakery',
      'woodenTower',
      'mill',
      'siegeWorkshop',
      'woodenTower',
      'field',
    ],
  },
} as const satisfies Record<string, AiPersonalityDefinition>;

export type AiPersonalityId = keyof typeof AI_PERSONALITIES;

export const isAiDifficultyId = (id: string): id is AiDifficultyId =>
  Object.hasOwn(AI_DIFFICULTIES, id);

export const isAiPersonalityId = (id: string): id is AiPersonalityId =>
  Object.hasOwn(AI_PERSONALITIES, id);

/** Rules every computer player follows, whatever its difficulty. */
export const AI_RULES = {
  /** It builds a house when fewer than this many places are free. */
  freeHousing: 4,
  /** With a mine, it recruits no serf that would leave less food than this. */
  mineFoodReserve: 8,
  /** It repairs a building that has lost at least this share of its health... */
  repairAtShare: 0.1,
  /** ...with this many serfs, once no enemy is within `dangerRadius` of it. */
  repairers: 2,
  /** Serfs and buildings stay this far from where it saw enemies. */
  dangerRadius: 18,
  /** Seconds it remembers where it saw enemies (when it can't look again). */
  dangerMemorySeconds: 120,
  /** The most of its serfs it has building at once, so the others keep gathering. */
  builderShare: 0.5,
  /** After finding no room for a building, seconds until it looks again. */
  retrySeconds: 45,
  /** Gatherers move over once a resource has this many times the stock it wants. */
  surplusFactor: 3,
  /** Where it gathers once the home ground (`HOME_RADIUS`) has nothing left. */
  farGatherRadius: 70,
  /** Food training leaves in the stock. */
  trainFoodReserve: 4,
  /**
   * What it takes a camp it has never seen to be worth: low enough that the starting
   * heroes and the archers the starting gold pays for set out against one on any
   * difficulty (their bounties pay for what comes after).
   */
  unknownCamp: 70,
  /** Each time a camp beats it off, it wants this much more of a margin. */
  campCaution: 0.3,
  /** Its army waits this far from its Town Hall, toward the middle of the map. */
  rallyDistance: 13,
  /** Enemies this close to one of its buildings are an attack on its base... */
  defendRadius: 20,
  /** ...except monsters this close to a deposit: they are only guarding it. */
  campRadius: 15,
  /** Marches shorter than this go straight; longer ones keep to the inner ring... */
  directMarch: 90,
  /** ...a square this share of the map's size from its middle. */
  innerShare: 0.14,
  /** An army marches in hops this long, waiting for its slower units at each. */
  marchHop: 24,
  /** The share of an army that has to have caught up before it moves on. */
  togetherShare: 0.75,
  /** A unit this close to where the army is going has arrived. */
  arrived: 9,
  /** Seconds it waits for stragglers before moving on without them. */
  waitSeconds: 25,
  /** Seconds after which it gives an attack up. */
  attackSeconds: 360,
  /** Enemies this close to its army count in its judgement of a fight. */
  fightRadius: 16,
  /** What a tower is worth to it as an enemy. */
  towerStrength: 25,
  /** It gives up an attack that has lost this share of its strength. */
  brokenShare: 0.35,
  /** An attack on a player also counts as ready when it can't grow any further. */
  fullArmyShare: 0.9,
  /** Seconds before it sends a scout again. */
  scoutPauseSeconds: 90,
  /** A target with allies this close to it is preferred by this many units of distance. */
  allyPull: { radius: 35, bonus: 40 },
  /** How far toward the middle it builds its towers, and how far around that spot. */
  towerLine: { distance: 22, radius: 16 },
} as const;
