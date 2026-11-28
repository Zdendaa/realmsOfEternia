import type { AiDifficultyDefinition, AiPersonalityDefinition, BuildingId } from '@roe/game-data';
import type { EntityId, Rng } from '@roe/shared';
import type { Command } from '../commands/types.js';
import type { Budget } from './budget.js';
import type { SpotOptions, SpotSearch } from './buildingSpot.js';
import type { AiKnowledge } from './knowledge.js';
import type { AiState } from './state.js';

/** A command a manager wants given, with a few words on why. */
export interface AiProposal {
  command: Command;
  note: string;
}

/** What a manager decides from. */
export interface ManagerInput {
  knowledge: AiKnowledge;
  /** Its memory, with what this look taught it. */
  memory: AiState;
  personality: AiPersonalityDefinition;
  difficulty: AiDifficultyDefinition;
  rng: Rng;
  /** `searchBuildingSpot` for this player, one decision's worth from candidate `from`. */
  findSpot: (building: BuildingId, options: SpotOptions, from: number) => SpotSearch;
  /** Serfs already given a job in this decision. */
  claimed: Set<EntityId>;
  /** What no manager of this decision has spent yet. */
  budget: Budget;
}
