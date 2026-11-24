export {
  applyCommand,
  validateCommand,
  type CommandCheck,
  type CommandIssue,
  type CommandResult,
} from './commands/applyCommand.js';
export {
  MAX_COMMAND_UNITS,
  parseCommand,
  type AssignBuildersCommand,
  type Command,
  type IssuedCommand,
  type MoveUnitsCommand,
  type PlaceBuildingCommand,
  type RecruitSerfCommand,
} from './commands/types.js';
export { workSlots } from './construction/workSlots.js';
export { canAfford, EMPTY_STOCK, missingResources, stockOf } from './economy/stock.js';
export { createSimContext, syncContext, type SimContext } from './context/simContext.js';
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
  quarterTurnsToRadians,
  type PlacementCheck,
  type PlacementIssue,
} from './rules/placement.js';
export { createPointGrid, type PointGrid } from './spatial/pointGrid.js';
export {
  createInitialState,
  isStartingBuilding,
  toPlacedFootprint,
  type BuildingInstance,
  type BuildingStatus,
  type ConstructionProgress,
  type GameState,
  type InitialStateOptions,
} from './state/gameState.js';
export { createStateHeights } from './state/stateHeights.js';
export type { UnitActivity, UnitInstance, UnitMovement, UnitTask } from './state/units.js';
export { stepGame, type StepResult } from './tick/stepGame.js';
export { MOVEMENT_RULES } from './units/movement.js';
export { SERF_RULES } from './units/serfBehavior.js';
export {
  boundsOf,
  createWorld,
  inBounds,
  type Bounds,
  type PlacedBuilding,
  type SimWorld,
} from './world/createWorld.js';
