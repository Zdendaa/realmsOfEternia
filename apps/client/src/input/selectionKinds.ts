import type { EntityId } from '@roe/shared';
import { isAlive } from '@roe/sim';
import { useGameStore } from '../state/gameStore';
import { useSelectionStore } from '../state/selectionStore';
import type { SelectionKinds } from './cursorKind';

/** Whether any units are selected, and whether some of them fight or are serfs. */
export function selectionKinds(ids: readonly EntityId[] = useSelectionStore.getState().units) {
  const kinds: SelectionKinds = { units: ids.length > 0, fighters: false, serfs: false };
  if (!kinds.units) return kinds;
  const wanted = new Set(ids);
  for (const unit of useGameStore.getState().state.units) {
    if (!wanted.has(unit.id) || !isAlive(unit)) continue;
    if (unit.combat) kinds.fighters = true;
    if (unit.type === 'serf') kinds.serfs = true;
    if (kinds.fighters && kinds.serfs) break;
  }
  return kinds;
}
