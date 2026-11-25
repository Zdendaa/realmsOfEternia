import {
  BUILDINGS,
  depositOf,
  isWall,
  RESOURCES,
  type BuildingDefinition,
  type BuildingId,
  type ResourceAmounts,
} from '@roe/game-data';
import { EMPTY_STOCK, missingResources, type CommandIssue } from '@roe/sim';
import { useEffect, type CSSProperties } from 'react';
import { LOCAL_PLAYER, useGameStore } from '../state/gameStore';
import { usePlacementStore } from '../state/placementStore';
import { WallHint } from './WallHint';
import { CostList } from './CostList';
import { PLACEMENT_MESSAGES } from './placementMessages';

const BUILDABLE = Object.values(BUILDINGS).filter((b) => b.buildable) as (BuildingDefinition & {
  id: BuildingId;
})[];

/** More buildings than this go into two balanced rows (the menu must clear the side panels). */
const MAX_ONE_ROW = 7;
const COLUMNS =
  BUILDABLE.length <= MAX_ONE_ROW ? BUILDABLE.length : Math.ceil(BUILDABLE.length / 2);

/** "Not enough wood and stone" for the resources the stock can't cover. */
function shortageMessage(building: BuildingId, stock: Readonly<ResourceAmounts>) {
  const names = missingResources(stock, BUILDINGS[building].cost).map((id) =>
    RESOURCES[id].name.toLowerCase(),
  );
  if (names.length === 0) return PLACEMENT_MESSAGES.notEnoughResources;
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
  return `Not enough ${list}`;
}

function issueMessage(issue: CommandIssue, building: BuildingId, stock: Readonly<ResourceAmounts>) {
  if (issue === 'notEnoughResources') return shortageMessage(building, stock);
  const deposit = depositOf(building);
  if (issue === 'deposit' && deposit) {
    return `Must be built on ${deposit === 'iron' ? 'an iron' : 'a gold'} deposit`;
  }
  return issue in PLACEMENT_MESSAGES
    ? PLACEMENT_MESSAGES[issue as keyof typeof PLACEMENT_MESSAGES]
    : 'Cannot build here';
}

/**
 * Construction panel: pick a building, then place it in the world. Placing pays the
 * cost from the stock; costs the stock can't cover are shown in red.
 */
export function ConstructionMenu() {
  const selected = usePlacementStore((s) => s.selected);
  const feedback = usePlacementStore((s) => s.feedback);
  const select = usePlacementStore((s) => s.select);
  const stock = useGameStore((s) => s.state.stocks[LOCAL_PLAYER] ?? EMPTY_STOCK);

  // Escape leaves placement mode from anywhere in the page.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Escape') usePlacementStore.getState().select(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const firstIssue = feedback && !feedback.ok ? feedback.issues[0] : undefined;

  return (
    <section className="hud-panel construction-menu" aria-label="Construction">
      {selected && isWall(selected) && <WallHint building={selected} />}
      {selected && !isWall(selected) && (
        <p className={`placement-hint ${firstIssue ? 'is-invalid' : ''}`} role="status">
          {firstIssue
            ? issueMessage(firstIssue, selected, stock)
            : 'Click to build · R rotate · Shift+click build more · Esc cancel'}
        </p>
      )}
      <ul className="construction-list" style={{ '--columns': COLUMNS } as CSSProperties}>
        {BUILDABLE.map((building) => {
          const affordable = missingResources(stock, building.cost).length === 0;
          return (
            <li key={building.id}>
              <button
                type="button"
                className={`construction-item ${selected === building.id ? 'is-selected' : ''} ${affordable ? '' : 'is-unaffordable'}`}
                aria-pressed={selected === building.id}
                title={building.description}
                onClick={() => select(selected === building.id ? null : building.id)}
              >
                <span className="construction-name">{building.name}</span>
                <CostList cost={building.cost} stock={stock} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
