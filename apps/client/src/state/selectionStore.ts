import type { EntityId } from '@roe/shared';
import { create } from 'zustand';

/** What the local player has selected. UI-only state: never sent to the server. */
interface SelectionStore {
  /** Selected units (own units only). */
  units: readonly EntityId[];
  /** Selected building, when no units are selected. */
  building: EntityId | null;
  selectUnits: (ids: readonly EntityId[]) => void;
  selectBuilding: (id: EntityId | null) => void;
  clear: () => void;
}

export const useSelectionStore = create<SelectionStore>()((set) => ({
  units: [],
  building: null,
  selectUnits: (ids) => set({ units: ids, building: null }),
  selectBuilding: (id) => set({ units: [], building: id }),
  clear: () => set({ units: [], building: null }),
}));
