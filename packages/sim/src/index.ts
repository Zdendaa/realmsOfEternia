export {
  applyCommand,
  validateCommand,
  type CommandCheck,
  type CommandIssue,
  type CommandResult,
} from './commands/applyCommand.js';
export {
  MAX_COMMAND_UNITS,
  MAX_DEBUG_SPAWN,
  parseCommand,
  type AssignBuildersCommand,
  type RepairCommand,
  type AttackCommand,
  type AttackMoveCommand,
  type Command,
  type DebugSpawnCommand,
  type DebugWaveCommand,
  type GatherCommand,
  type IssuedCommand,
  type MoveUnitsCommand,
  type PlaceBuildingCommand,
  type PlaceWallCommand,
  type MakeGateCommand,
  DEBUG_RESOURCES,
  type UpgradeTowerCommand,
  type CancelUpgradeCommand,
  type RecruitSerfCommand,
  type CancelTrainingCommand,
  type StopCommand,
  type TrainUnitCommand,
} from './commands/types.js';
export {
  TRAINING_QUEUE_LIMIT,
  trainingProgress,
  trainTicks,
  type TrainingQueue,
} from './training/training.js';
export { approachPoint, buildingMaxHealth } from './combat/buildings.js';
export { combatTicks } from './combat/fighting.js';
export { areEnemies, MONSTER_PLAYER } from './combat/hostility.js';
export { waveTick } from './combat/waves.js';
export type { Projectile } from './combat/projectiles.js';
export { workSlots } from './construction/workSlots.js';
export { repairCost } from './construction/repair.js';
export { hasFreeHousing, populationOf, type Population } from './economy/population.js';
export { canAfford, EMPTY_STOCK, missingResources, stockOf } from './economy/stock.js';
export {
  createSimContext,
  dropVision,
  ensureVision,
  syncContext,
  type SimContext,
  type SimContextOptions,
} from './context/simContext.js';
export { createPathFinder, type PathFinder, type PathResult } from './nav/astar.js';
export {
  cellIndexAt,
  createNavGrid,
  isWalkable,
  NAV_RULES,
  nearestWalkablePoint,
  type NavGrid,
} from './nav/navGrid.js';
export {
  checkPlacement,
  PLACEMENT_RULES,
  depositAt,
  quarterTurnsToRadians,
  type PlacementCheck,
  type PlacementIssue,
} from './rules/placement.js';
export { createPointGrid, type PointGrid } from './spatial/pointGrid.js';
export {
  createInitialState,
  isStartingBuilding,
  toPlacedFootprint,
  footprintOf,
  type BuildingInstance,
  type BuildingStatus,
  type ConstructionProgress,
  type GameState,
  type InitialStateOptions,
  type Ruin,
} from './state/gameState.js';
export {
  gatherReach,
  initialAmount,
  isDepleted,
  isHarvestable,
  nodeById,
  remainingAmount,
} from './state/resourceNodes.js';
export { createStateHeights } from './state/stateHeights.js';
export {
  FIELD_RULES,
  fieldOf,
  isRipe,
  plotCenter,
  plotCount,
  plotWorkPoint,
  type FieldPhase,
  type FieldState,
} from './state/fields.js';
export { createUnit, isAlive } from './state/units.js';
export type {
  Cargo,
  GatherPhase,
  UnitActivity,
  UnitCombat,
  UnitInstance,
  UnitMovement,
  UnitTask,
  WorkPhase,
  WorkTask,
} from './state/units.js';
export { stepGame, type StepResult } from './tick/stepGame.js';
export { MOVEMENT_RULES } from './units/movement.js';
export { SERF_RULES } from './units/serfBehavior.js';
export { awaitsWorker } from './units/workers.js';
export { STORAGE_RULES } from './units/gathering.js';
export {
  boundsOf,
  createWorld,
  inBounds,
  type Bounds,
  type PlacedBuilding,
  type SimWorld,
} from './world/createWorld.js';
export {
  buildingSeen,
  cellAt,
  createVision,
  isExplored,
  isVisible,
  updateVision,
  VISION_CELL,
  type Vision,
} from './vision/vision.js';
export { viewOf, type PlayerView } from './vision/view.js';
export { decideOutcomes, EMPTY_STATS, type Outcome, type PlayerStats } from './rules/outcome.js';
export {
  planWall,
  budgetWall,
  snapWallLine,
  wallCost,
  wallSegments,
  type PlannedSegment,
  type WallIssue,
  type WallPlan,
  type WallSegment,
} from './rules/walls.js';
export { findCutOff, type CutOff } from './rules/enclosure.js';
export type { TowerUpgrade, TowerUpgrades } from './combat/upgrades.js';
