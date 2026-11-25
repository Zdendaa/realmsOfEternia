import { BUILDINGS, RESOURCE_IDS, type BuildingId } from '@roe/game-data';
import { EMPTY_STOCK, type CutOff } from '@roe/sim';
import { LOCAL_PLAYER, useGameStore } from '../state/gameStore';
import { usePlacementStore } from '../state/placementStore';
import { CostList } from './CostList';
import { PLACEMENT_MESSAGES } from './placementMessages';

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** "3 units and 1 building site" */
function cutOffText({ units, sites }: CutOff) {
  return [units && plural(units, 'unit'), sites && plural(sites, 'building site')]
    .filter(Boolean)
    .join(' and ');
}

/**
 * The wall tool's line above the construction menu: how to draw, then for the line being
 * dragged its length and total cost, what is blocked, and a warning when it would shut
 * the player's own units or building sites off from the rest of the map.
 */
export function WallHint({ building }: { building: BuildingId }) {
  const wall = usePlacementStore((s) => s.wall);
  const drawn = usePlacementStore((s) => s.wallWarning);
  const stock = useGameStore((s) => s.state.stocks[LOCAL_PLAYER] ?? EMPTY_STOCK);

  if (!wall) {
    return (
      <div role="status">
        <p className="placement-hint">
          Drag to draw a wall · drag on from its end to turn a corner · Esc or right click: done
        </p>
        {drawn && (
          <p className="placement-hint is-warning">
            Your wall shuts in {cutOffText(drawn)}, with no way out
          </p>
        )}
      </div>
    );
  }

  const cost = BUILDINGS[building].cost as Partial<Record<(typeof RESOURCE_IDS)[number], number>>;
  const total = Object.fromEntries(
    RESOURCE_IDS.filter((id) => cost[id]).map((id) => [id, (cost[id] ?? 0) * wall.count]),
  );
  const issue = wall.check.ok ? null : wall.check.issues[0];
  const message =
    issue === 'notEnoughResources'
      ? 'Not enough resources'
      : issue && issue in PLACEMENT_MESSAGES
        ? PLACEMENT_MESSAGES[issue as keyof typeof PLACEMENT_MESSAGES]
        : null;
  const cutOff = wall.cutOff.units > 0 || wall.cutOff.sites > 0;
  return (
    <div role="status">
      <div className={`placement-hint wall-total ${message ? 'is-invalid' : ''}`}>
        {plural(wall.count, 'segment')}
        {wall.count > 0 && <CostList cost={total} stock={stock} />}
        {message && <span>{message}</span>}
        {!message && wall.unaffordable > 0 && (
          <span className="wall-unaffordable">{wall.unaffordable} more unaffordable</span>
        )}
        {!message && wall.blocked > 0 && wall.blockedIssue && (
          <span className="wall-blocked">
            {wall.blocked} left out: {PLACEMENT_MESSAGES[wall.blockedIssue]}
          </span>
        )}
      </div>
      {cutOff && (
        <p className="placement-hint is-warning">
          Warning: this would shut in {cutOffText(wall.cutOff)}, with no way out
        </p>
      )}
    </div>
  );
}
