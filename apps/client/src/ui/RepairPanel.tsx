import { BUILDINGS } from '@roe/game-data';
import {
  EMPTY_STOCK,
  isAlive,
  missingResources,
  repairCost,
  type BuildingInstance,
  type GameState,
} from '@roe/sim';
import { LOCAL_PLAYER, useGameStore } from '../state/gameStore';
import { CostList } from './CostList';

/** The player's serfs with nothing to do. */
const idleSerfs = (state: GameState) =>
  state.units.filter(
    (u) => u.type === 'serf' && u.ownerId === LOCAL_PLAYER && u.task.kind === 'idle' && isAlive(u),
  );

/**
 * "damage;repairers;idle serfs;waiting" of a building, as one string so the panel
 * re-renders only when one of them changes. Waiting: repairers at their places stand
 * because the stock can't pay.
 */
function useRepairSummary(buildingId: number) {
  return useGameStore((s) => {
    let repairers = 0;
    let waiting = false;
    for (const u of s.state.units) {
      if (u.task.kind !== 'repair' || u.task.buildingId !== buildingId) continue;
      repairers++;
      if (u.activity === 'idle') waiting = true;
    }
    const damage = s.state.buildingDamage[buildingId] ?? 0;
    return `${damage};${repairers};${idleSerfs(s.state).length};${waiting ? 1 : 0}`;
  });
}

/**
 * Repairing a damaged own building (hidden while unhurt): the button sends the nearest
 * idle serfs to its free places; what the rest of the repair costs, and who works on it.
 */
export function RepairPanel({ building }: { building: BuildingInstance }) {
  const dispatch = useGameStore((s) => s.dispatch);
  const stock = useGameStore((s) => s.state.stocks[LOCAL_PLAYER] ?? EMPTY_STOCK);
  const summary = useRepairSummary(building.id);
  const [damage = 0, repairers = 0, idle = 0, waiting = 0] = summary.split(';').map(Number);
  if (damage === 0) return null;

  const { maxBuilders } = BUILDINGS[building.type];
  const free = Math.max(0, maxBuilders - repairers);
  const cost = repairCost(building.type, damage);
  const gratis = Object.keys(cost).length === 0;

  const send = () => {
    const distance = (u: { x: number; z: number }) =>
      Math.hypot(u.x - building.x, u.z - building.z);
    const unitIds = idleSerfs(useGameStore.getState().state)
      .sort((a, b) => distance(a) - distance(b) || a.id - b.id)
      .slice(0, free)
      .map((u) => u.id);
    if (unitIds.length > 0) dispatch({ type: 'repair', unitIds, buildingId: building.id });
  };

  return (
    <>
      <div className="selection-action-row">
        <button
          type="button"
          className="selection-action"
          onClick={send}
          disabled={free === 0 || idle === 0}
          title="Sends the nearest idle serfs"
        >
          Repair
        </button>
        {gratis ? (
          <span className="training-time">Free</span>
        ) : (
          <CostList cost={cost} stock={stock} />
        )}
      </div>
      <p className="selection-meta">
        Repairing: {repairers} / {maxBuilders}
        {repairers === 0 && idle === 0 && ' · no idle serfs: select serfs and right-click it'}
      </p>
      {waiting === 1 && missingResources(stock, cost).length > 0 && (
        <p className="selection-issue">Repair is waiting for resources.</p>
      )}
    </>
  );
}
