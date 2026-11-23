import { BUILDINGS, RESOURCES, type BuildingDefinition, type BuildingId } from '@roe/game-data';
import { useEffect } from 'react';
import { usePlacementStore } from '../state/placementStore';
import { PLACEMENT_MESSAGES } from './placementMessages';

const BUILDABLE = Object.values(BUILDINGS).filter((b) => b.buildable) as (BuildingDefinition & {
  id: BuildingId;
})[];

function CostList({ cost }: { cost: BuildingDefinition['cost'] }) {
  const entries = Object.entries(cost) as [keyof typeof RESOURCES, number][];
  return (
    <ul className="cost-list">
      {entries.map(([resource, amount]) => (
        <li key={resource} className={`cost cost-${resource}`}>
          {amount} {RESOURCES[resource].name}
        </li>
      ))}
    </ul>
  );
}

/** Construction panel: pick a building, then place it in the world. Costs are display-only. */
export function ConstructionMenu() {
  const selected = usePlacementStore((s) => s.selected);
  const feedback = usePlacementStore((s) => s.feedback);
  const select = usePlacementStore((s) => s.select);

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
      {selected && (
        <p className={`placement-hint ${firstIssue ? 'is-invalid' : ''}`} role="status">
          {firstIssue
            ? PLACEMENT_MESSAGES[firstIssue]
            : 'Click to build · R rotate · Shift+click build more · Esc cancel'}
        </p>
      )}
      <ul className="construction-list">
        {BUILDABLE.map((building) => (
          <li key={building.id}>
            <button
              type="button"
              className={`construction-item ${selected === building.id ? 'is-selected' : ''}`}
              aria-pressed={selected === building.id}
              title={building.description}
              onClick={() => select(selected === building.id ? null : building.id)}
            >
              <span className="construction-name">{building.name}</span>
              <CostList cost={building.cost} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
