export {
  CHARACTER_PACK,
  RIG_MEDIUM,
  type AnimationClipRef,
  type CharacterAnimation,
  type AtlasCell,
  type CharacterModel,
  type SoldierAnimation,
  type SoldierModel,
  type WeaponId,
} from './assets/characterPack.js';
export { HEXAGON_PACK } from './assets/hexagonPack.js';
export { MEDIEVAL_PACK, type MaterialOverride } from './assets/medievalPack.js';
export {
  BUILDINGS,
  depositOf,
  housingOf,
  isBuildingId,
  isWalkableBuilding,
  isWall,
  towerOf,
  upgradesOf,
  isGate,
  gateFor,
  wallTierOf,
  modelPathOf,
  buildingHealthOf,
  buildingSightOf,
  productionOf,
  trainsOf,
  type BuildingId,
} from './buildings/definitions.js';
export { BUILDING_SIGHT } from './buildings/sight.js';
export { REPAIR_RULES } from './buildings/repair.js';
export { WALL_RULES } from './buildings/walls.js';
export { tileOffsets } from './buildings/tiling.js';
export type {
  BuildingDefinition,
  FarmProduction,
  HarvestProduction,
  ModelPartPlacement,
  ModelTiling,
  ProcessProduction,
  ProductionDefinition,
  ResourceAmount,
  SpinningPart,
  TowerDefinition,
  WallModel,
} from './buildings/types.js';
export { PROPS, type PropDefinition, type PropId } from './props/definitions.js';
export { STARTING_RESOURCES, STORAGE_BUILDINGS } from './economy/startingResources.js';
export {
  RESOURCE_IDS,
  RESOURCES,
  resourcesIn,
  type ResourceAmounts,
  type ResourceCategory,
  type ResourceCost,
  type ResourceDefinition,
  type ResourceId,
} from './resources/definitions.js';
export { GATHER_RULES, RESOURCE_NODES, type ResourceNodeDefinition } from './resources/nodes.js';
export { PROTOTYPE_MAP } from './maps/prototype.js';
export {
  PROTOTYPE_SETTLEMENT,
  type BuildingPlacement,
  type SettlementLayout,
} from './maps/prototypeSettlement.js';
export { attackOf, combatOf, isUnitKind, UNITS, type UnitKind } from './units/definitions.js';
export type { UnitDefinition } from './units/types.js';
export {
  BUILDING_COMBAT,
  BREACH_RULES,
  COMBAT_RULES,
  damageAgainst,
  type ArmorClass,
  type AttackDefinition,
  type CombatStats,
} from './units/combat.js';
export {
  PROFESSIONS,
  type HatStyle,
  type ProfessionDefinition,
  type ProfessionId,
} from './units/professions.js';
