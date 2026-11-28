import { AI_RULES, attackOf, isWall, towerOf } from '@roe/game-data';
import { SIMULATION_TICK_RATE, type EntityId, type Vec2 } from '@roe/shared';
import { MONSTER_PLAYER } from '../combat/hostility.js';
import { maxHealthOf } from '../heroes/heroes.js';
import type { UnitInstance } from '../state/units.js';
import type { AiKnowledge } from './knowledge.js';
import type { AiProposal, ManagerInput } from './manager.js';
import { marchLegs } from './route.js';
import { mixSeed } from './schedule.js';
import type { AiArmy, AiMission, AiState } from './state.js';
import { distanceSq, isSoldier, totalStrength, within } from './strength.js';
import { chooseCamp, chooseTarget, rallyPoint, unscouted } from './targets.js';

/** A unit ordered this close to where it should go needn't be told again. */
const SAME_GOAL = 6;
/** Home soldiers farther than this from the rally point are called back to it. */
const AT_HOME = 14;
/** The home guard must be this many times the attackers' strength, or the army returns. */
const HOLD_RATIO = 1.2;
/** Seconds either side of the difficulty's time that the first attack may come. */
const ATTACK_JITTER = 60;
/** It looks for the enemy this many seconds before it may attack. */
const SCOUT_AHEAD = 180;
/** The smallest army that can spare a scout. */
const SCOUT_SPARE = 3;
/** How close to the target an army counts as having reached it. */
const REACHED = 1;
/** It turns everyone on one enemy only among this many or more. */
const FOCUS_ENEMIES = 2;

const seconds = (s: number) => s * SIMULATION_TICK_RATE;

const centroid = (points: readonly Vec2[]): Vec2 => ({
  x: points.reduce((sum, p) => sum + p.x, 0) / Math.max(1, points.length),
  z: points.reduce((sum, p) => sum + p.z, 0) / Math.max(1, points.length),
});

/** The tick of its first attack on a player: the difficulty's, a little early or late. */
export const firstAttackTick = ({ difficulty, memory }: ManagerInput) =>
  seconds(
    difficulty.firstAttackSeconds + (mixSeed(memory.seed, 1) % (2 * ATTACK_JITTER)) - ATTACK_JITTER,
  );

/**
 * The enemies attacking its base: those within \`defendRadius\` of one of its buildings.
 * Monsters by a deposit only guard it, unless they have come for a building there.
 */
export function baseThreats({ knowledge }: ManagerInput): UnitInstance[] {
  // (Where a monster's home is doesn't show: only where it stands.)
  const guarding = (u: UnitInstance) =>
    u.ownerId === MONSTER_PLAYER &&
    knowledge.deposits.some((d) => within(d, u, AI_RULES.campRadius));
  return knowledge.enemyUnits.filter(
    (u) =>
      !guarding(u) &&
      knowledge.buildings.some((b) => !isWall(b.type) && within(b, u, AI_RULES.defendRadius)),
  );
}

/**
 * Those of \`units\` that need telling to go to \`goal\`: not fighting (a new order would
 * break off the blow), not already on their way there, and not already there.
 */
function strays(units: readonly UnitInstance[], goal: Vec2, march: boolean): EntityId[] {
  return units
    .filter((u) => {
      if (march && u.combat?.targetId !== null) return false;
      if (u.task.kind === 'cast' || u.task.kind === 'revive') return false;
      if (u.task.kind === (march ? 'attackMove' : 'move')) {
        const to = u.task.kind === 'attackMove' ? u.task : u.movement?.goal;
        if (to && within(to, goal, SAME_GOAL)) return false;
      }
      return !(u.task.kind === 'idle' && within(u, goal, AI_RULES.arrived));
    })
    .map((u) => u.id);
}

/** One order for those of \`units\` that need it: attack-move, or (\`march\` false) walk. */
function order(units: readonly UnitInstance[], goal: Vec2, note: string, march = true) {
  const unitIds = strays(units, goal, march);
  if (unitIds.length === 0) return [];
  const at = { x: Math.round(goal.x), z: Math.round(goal.z) };
  const proposal: AiProposal = {
    command: { type: march ? 'attackMove' : 'moveUnits', unitIds, ...at },
    note: `${unitIds.length} unit(s) ${note}`,
  };
  return [proposal];
}

/** Whether enough of \`units\` have caught up with \`hop\` (or are beyond it). */
function together(units: readonly UnitInstance[], hop: Vec2, target: Vec2): boolean {
  const left = Math.sqrt(distanceSq(hop, target));
  const there = units.filter(
    (u) => within(u, hop, AI_RULES.arrived) || Math.sqrt(distanceSq(u, target)) < left,
  );
  return there.length >= units.length * AI_RULES.togetherShare;
}

/** What it sees of the enemy around \`at\`, as strength: units, and towers. */
function enemyStrengthAt(knowledge: AiKnowledge, at: Vec2): number {
  const units = knowledge.enemyUnits.filter((u) => within(u, at, AI_RULES.fightRadius));
  const towers = knowledge.otherBuildings.filter(
    (b) => knowledge.isEnemy(b.ownerId) && towerOf(b.type) && within(b, at, AI_RULES.fightRadius),
  );
  return totalStrength(units) + towers.length * AI_RULES.towerStrength;
}

interface Drive {
  proposals: AiProposal[];
  mission: AiMission | null;
  failed: AiArmy['failed'];
  raids: number;
}

/** Turns the army on the weakest of several enemies in its fight, one at a time. */
function focus(input: ManagerInput, mission: AiMission, units: readonly UnitInstance[]) {
  const { knowledge } = input;
  const foes = knowledge.enemyUnits.filter((u) => within(u, centroid(units), AI_RULES.fightRadius));
  if (mission.focus !== null && foes.some((u) => u.id === mission.focus)) {
    return { focus: mission.focus, proposals: [] };
  }
  if (foes.length < FOCUS_ENEMIES) return { focus: null, proposals: [] };
  const weakest = foes.reduce((a, b) => (b.health < a.health ? b : a));
  const unitIds = units
    .filter((u) => !attackOf(u.type)?.siege && u.combat?.targetId !== null)
    .filter((u) => u.combat?.targetId !== weakest.id && u.task.kind !== 'cast')
    .map((u) => u.id);
  if (unitIds.length === 0) return { focus: null, proposals: [] };
  const proposal: AiProposal = {
    command: { type: 'attack', unitIds, targetId: weakest.id },
    note: `${unitIds.length} unit(s) focus one enemy`,
  };
  return { focus: weakest.id, proposals: [proposal] };
}

/** One look at the army's expedition: gather, march and fight, or come home. */
function drive(input: ManagerInput, current: AiMission, rally: Vec2): Drive {
  const { knowledge, memory, difficulty } = input;
  const { tick } = knowledge;
  const { army } = memory;
  const result: Drive = { proposals: [], mission: null, failed: army.failed, raids: army.raids };
  const alive = new Map(knowledge.units.map((u) => [u.id, u]));
  let units = current.units.flatMap((id) => alive.get(id) ?? []);
  const beaten = () => {
    if (current.deposit === null) return;
    const before = army.failed[current.deposit] ?? 0;
    result.failed = { ...army.failed, [current.deposit]: before + 1 };
  };
  if (units.length === 0) {
    beaten();
    return result;
  }
  let mission: AiMission = current;
  const begin = (stage: AiMission['stage'], hop: Vec2) => {
    mission = { ...mission, stage, hop, stageAt: tick, hopAt: tick, focus: null };
  };
  /** The next hop: along the way to the leg it is on, dropping the legs it has reached. */
  const advance = (from: Vec2) => {
    let { legs } = mission;
    while (legs.length > 1 && within(from, legs[0] as Vec2, AI_RULES.arrived)) {
      legs = legs.slice(1);
    }
    const hop = knowledge.alongRoute(from, legs[0] ?? mission.target, AI_RULES.marchHop);
    return { hop, legs };
  };
  const legsTo = (from: Vec2, to: Vec2) =>
    mission.kind === 'raid' ? marchLegs(from, to, knowledge.mapSize) : [to];

  // The badly hurt go home before they fall.
  if (difficulty.pullBackShare > 0 && mission.stage === 'march') {
    const hurt = units.filter((u) => u.health < maxHealthOf(u) * difficulty.pullBackShare);
    if (hurt.length > 0) {
      result.proposals.push(...order(hurt, rally, 'pull back', false));
      const gone = new Set(hurt.map((u) => u.id));
      units = units.filter((u) => !gone.has(u.id));
      mission = { ...mission, units: units.map((u) => u.id) };
      if (units.length === 0) {
        beaten();
        return result;
      }
    }
  }
  if (units.length !== mission.units.length) {
    mission = { ...mission, units: units.map((u) => u.id) };
  }

  if (mission.stage === 'gather') {
    const waited = tick - mission.stageAt > seconds(AI_RULES.waitSeconds);
    if (waited || together(units, rally, rally)) {
      mission = { ...mission, legs: legsTo(rally, mission.target) };
      const first = advance(centroid(units));
      begin('march', first.hop);
      mission = { ...mission, legs: first.legs, strength: totalStrength(units) };
      if (mission.kind === 'raid') result.raids = army.raids + 1;
    }
  } else if (mission.stage === 'march') {
    const own = totalStrength(units);
    const ratio = difficulty.retreatRatio;
    const outmatched =
      ratio !== null &&
      (enemyStrengthAt(knowledge, centroid(units)) > own * ratio ||
        own < mission.strength * AI_RULES.brokenShare);
    // (Each new leg of a march starts the clock for giving up again.)
    const tooLong = tick - mission.stageAt > seconds(AI_RULES.attackSeconds);
    if (outmatched || tooLong) {
      beaten();
      begin('retreat', rally);
    } else {
      const waited = tick - mission.hopAt > seconds(AI_RULES.waitSeconds);
      if (waited || together(units, mission.hop, mission.target)) {
        if (!within(mission.hop, mission.target, REACHED)) {
          mission = { ...mission, ...advance(mission.hop), hopAt: tick };
        } else if (mission.kind === 'camp') {
          const cleared = mission.deposit !== null && memory.deposits[mission.deposit] === 'clear';
          if (cleared) return result;
        } else {
          // At the target: once it is gone, on to the next one it knows of.
          const standing = memory.sightings.some((s) => within(s, mission.target, REACHED));
          if (!standing) {
            const next = chooseTarget(input, mission.target);
            if (!next) begin('retreat', rally);
            else {
              const target = { x: next.x, z: next.z };
              const legs = legsTo(mission.hop, target);
              mission = { ...mission, target, legs, stageAt: tick };
            }
          }
        }
      }
      // A cleared camp ends the expedition wherever the army stands.
      if (mission.deposit !== null && memory.deposits[mission.deposit] === 'clear') return result;
    }
  } else {
    const waited = tick - mission.stageAt > seconds(AI_RULES.waitSeconds * 2);
    if (waited || together(units, rally, rally)) return result;
  }

  if (mission.stage === 'march' && difficulty.focusFire) {
    const turned = focus(input, mission, units);
    if (turned.focus !== mission.focus) mission = { ...mission, focus: turned.focus };
    result.proposals.push(...turned.proposals);
  }
  const note = { gather: 'gather', march: 'march', retreat: 'retreat' }[mission.stage];
  const marching = mission.stage !== 'retreat';
  const free = units.filter((u) => mission.focus === null || u.task.kind !== 'attack');
  const goal = mission.stage === 'march' ? mission.hop : rally;
  result.proposals.push(...order(free, goal, note, marching));
  result.mission = mission;
  return result;
}

/** A new expedition of \`units\` against a camp or a player, if one is due. */
function newMission(
  input: ManagerInput,
  units: readonly UnitInstance[],
  rally: Vec2,
): AiMission | null {
  const { knowledge, memory, personality, difficulty } = input;
  const strength = totalStrength(units);
  if (units.length === 0) return null;
  const mission = (kind: AiMission['kind'], target: Vec2, deposit: number | null): AiMission => ({
    kind,
    stage: 'gather',
    target: { x: target.x, z: target.z },
    legs: [],
    deposit,
    units: units.map((u) => u.id),
    strength,
    hop: rally,
    stageAt: knowledge.tick,
    hopAt: knowledge.tick,
    focus: null,
  });
  const camp = chooseCamp(input);
  if (camp && strength >= camp.need) return mission('camp', camp.at, camp.deposit);

  if (knowledge.tick < firstAttackTick(input)) return null;
  const wanted =
    (personality.attackStrength + memory.army.raids * personality.attackGrowth) *
    difficulty.attackScale;
  const soldiers = units.filter((u) => !u.hero).length;
  const full = soldiers >= difficulty.maxSoldiers * AI_RULES.fullArmyShare;
  if (strength < wanted && !full) return null;
  const target = chooseTarget(input, rally);
  if (target) return mission('raid', target, null);
  // An army that can't grow doesn't wait for the scout: it goes looking itself.
  const unknown = full ? unscouted(knowledge, memory.visited, rally) : null;
  return unknown ? mission('raid', unknown, null) : null;
}

/** Sends one soldier to look for the enemy while it knows of no building of theirs. */
function scouting(
  input: ManagerInput,
  home: readonly UnitInstance[],
  rally: Vec2,
): { proposals: AiProposal[]; army: Pick<AiArmy, 'scout' | 'scoutedAt'> } {
  const { knowledge, memory } = input;
  const { scout, scoutedAt } = memory.army;
  const { tick } = knowledge;
  const unit = scout ? knowledge.units.find((u) => u.id === scout.unit) : undefined;
  if (scout) {
    const goal = scout.legs.at(-1) as Vec2;
    const seen = knowledge.startSlots.some(
      (slot, i) => memory.visited.includes(i) && within(slot, goal, REACHED),
    );
    if (!unit || seen || memory.sightings.length > 0) {
      const back = unit ? order([unit], rally, 'scout home', false) : [];
      return { proposals: back, army: { scout: null, scoutedAt: tick } };
    }
    let { legs } = scout;
    while (legs.length > 1 && within(unit, legs[0] as Vec2, AI_RULES.arrived)) {
      legs = legs.slice(1);
    }
    const next = legs === scout.legs ? scout : { ...scout, legs };
    return {
      proposals: order([unit], legs[0] as Vec2, 'scout', false),
      army: { scout: next, scoutedAt },
    };
  }
  const idle = { proposals: [], army: { scout, scoutedAt } };
  if (memory.sightings.length > 0) return idle;
  if (tick < firstAttackTick(input) - seconds(SCOUT_AHEAD)) return idle;
  if (scoutedAt !== null && tick < scoutedAt + seconds(AI_RULES.scoutPauseSeconds)) return idle;
  const spare = home.filter((u) => !u.hero && !attackOf(u.type)?.siege);
  if (home.length < SCOUT_SPARE) return idle;
  // Archers first: they see farthest.
  const chosen = spare.find((u) => u.type === 'archer') ?? spare[0];
  const slot = unscouted(knowledge, memory.visited, rally);
  if (!chosen || !slot) return idle;
  const legs = marchLegs(rally, slot, knowledge.mapSize);
  return {
    proposals: order([chosen], legs[0] as Vec2, 'scout', false),
    army: { scout: { unit: chosen.id, legs }, scoutedAt },
  };
}

export interface ArmyPlan {
  proposals: AiProposal[];
  memory: Pick<AiState, 'army' | 'visited'>;
}

/**
 * The army manager. An attack on its base comes first: the soldiers at home meet it, and
 * the army comes back too if they aren't enough. Otherwise the army is on one expedition
 * at a time (gather at the rally point, march together in hops, fight, retreat when
 * outmatched): against the guards of a deposit as soon as it is strong enough, and
 * against a player from the difficulty's time on. The rest wait at the rally point, and
 * one may go looking for the enemy.
 */
export function manageArmy(input: ManagerInput): ArmyPlan {
  const { knowledge, memory } = input;
  const { army } = memory;
  let { visited } = memory;
  const hall = knowledge.townHall ?? knowledge.buildings[0];
  if (!hall) return { proposals: [], memory: { army, visited } };
  const rally = rallyPoint(hall);
  const soldiers = knowledge.units.filter(isSoldier);
  const proposals: AiProposal[] = [];
  let { mission, failed, raids } = army;

  const threats = baseThreats(input);
  const away = new Set(mission?.units ?? []);
  if (army.scout) away.add(army.scout.unit);
  let home = soldiers.filter((u) => !away.has(u.id));
  if (threats.length > 0) {
    if (mission && totalStrength(home) < totalStrength(threats) * HOLD_RATIO) {
      mission = null;
      home = soldiers.filter((u) => u.id !== army.scout?.unit);
    }
    // Meet the attacker nearest to the Town Hall.
    const nearest = threats.reduce((a, b) => (distanceSq(b, hall) < distanceSq(a, hall) ? b : a));
    proposals.push(...order(home, nearest, 'defend the base'));
  }

  if (mission) {
    const result = drive(input, mission, rally);
    proposals.push(...result.proposals);
    ({ mission, failed, raids } = result);
  }

  const scouted = scouting(input, home, rally);
  proposals.push(...scouted.proposals);
  // Every start position looked at and still no enemy found: look again.
  if (memory.sightings.length === 0 && visited.length >= knowledge.startSlots.length) {
    visited = [];
  }

  if (threats.length === 0) {
    const busy = new Set(mission?.units ?? []);
    if (scouted.army.scout) busy.add(scouted.army.scout.unit);
    const waiting = soldiers.filter((u) => !busy.has(u.id));
    const fit = waiting.filter((u) => u.health >= maxHealthOf(u) * input.difficulty.pullBackShare);
    if (!mission) mission = newMission(input, fit, rally);
    if (!mission) {
      const astray = waiting.filter((u) => u.task.kind === 'idle' && !within(u, rally, AT_HOME));
      proposals.push(...order(astray, rally, 'wait at the rally point'));
    }
  }

  const next: AiArmy = {
    mission,
    failed,
    raids,
    defending: threats.length > 0,
    ...scouted.army,
  };
  // The same object when nothing changed, so the state only changes when it must.
  const same = JSON.stringify(next) === JSON.stringify(army);
  return { proposals, memory: { army: same ? army : next, visited } };
}
