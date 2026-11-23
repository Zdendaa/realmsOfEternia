export { applyCommand, validateCommand, type CommandResult } from './commands/applyCommand.js';
export {
  parseCommand,
  type Command,
  type IssuedCommand,
  type PlaceBuildingCommand,
} from './commands/types.js';
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
  toPlacedFootprint,
  type BuildingInstance,
  type GameState,
} from './state/gameState.js';
export { createStateHeights } from './state/stateHeights.js';
export {
  boundsOf,
  createWorld,
  inBounds,
  type Bounds,
  type PlacedBuilding,
  type SimWorld,
} from './world/createWorld.js';
