import { BUILDINGS, RESOURCES, UNITS, type ResourceId } from '@roe/game-data';
import type { CommandIssue } from '@roe/sim';
import { useState } from 'react';
import { LOCAL_PLAYER, useGameStore } from '../state/gameStore';
import { useSelectionStore } from '../state/selectionStore';
import { RESOURCE_ICONS } from './icons/resourceIcons';

const ISSUE_MESSAGES: Partial<Record<CommandIssue, string>> = {
  unitLimit: `You already have ${UNITS.serf.maxPerPlayer} serfs.`,
  underConstruction: 'The Town Hall is not finished yet.',
  notOwner: 'This building belongs to someone else.',
};

/** Recruiting at the selected Town Hall. */
function TownHallActions({ buildingId }: { buildingId: number }) {
  const dispatch = useGameStore((s) => s.dispatch);
  const serfs = useGameStore(
    (s) => s.state.units.filter((u) => u.type === 'serf' && u.ownerId === LOCAL_PLAYER).length,
  );
  const [issue, setIssue] = useState<CommandIssue | null>(null);

  const recruit = () => {
    const check = dispatch({ type: 'recruitSerf', buildingId });
    setIssue(check.ok ? null : (check.issues[0] ?? null));
  };

  return (
    <>
      <p className="selection-meta">
        Serfs: {serfs} / {UNITS.serf.maxPerPlayer}
      </p>
      <button type="button" className="selection-action" onClick={recruit}>
        Recruit serf
      </button>
      {issue && <p className="selection-issue">{ISSUE_MESSAGES[issue] ?? issue}</p>}
    </>
  );
}

/**
 * Delivered / needed material per resource of a site, as a compact string selector
 * ("wood:2:4,stone:0:2"), so the panel re-renders only when a delivery arrives.
 */
function SiteMaterials({ siteId, type }: { siteId: number; type: keyof typeof BUILDINGS }) {
  const summary = useGameStore((s) => {
    const delivered = s.state.construction[siteId]?.delivered ?? {};
    return Object.entries(BUILDINGS[type].cost)
      .map(([id, needed]) => `${id}:${delivered[id as ResourceId] ?? 0}:${needed}`)
      .join(',');
  });
  if (!summary) return null;
  return (
    <ul className="site-materials" aria-label="Materials delivered">
      {summary.split(',').map((entry) => {
        const [id, delivered, needed] = entry.split(':') as [ResourceId, string, string];
        return (
          <li
            key={id}
            className={delivered === needed ? 'is-complete' : ''}
            title={RESOURCES[id].name}
          >
            <img src={RESOURCE_ICONS[id]} alt={RESOURCES[id].name} width={14} height={14} />
            {delivered} / {needed}
          </li>
        );
      })}
    </ul>
  );
}

/** Progress, materials and builders of a selected construction site (re-renders only when they change). */
function SiteProgress({
  siteId,
  type,
  maxBuilders,
}: {
  siteId: number;
  type: keyof typeof BUILDINGS;
  maxBuilders: number;
}) {
  const percent = useGameStore((s) => {
    const progress = s.state.construction[siteId];
    return progress ? Math.floor((progress.workDone / progress.workRequired) * 100) : 100;
  });
  // Builders fetching material keep their place at the site.
  const builders = useGameStore(
    (s) =>
      s.state.units.filter(
        (u) => (u.task.kind === 'build' || u.task.kind === 'deliver') && u.task.siteId === siteId,
      ).length,
  );
  return (
    <>
      <p className="selection-meta">Under construction: {percent}%</p>
      <SiteMaterials siteId={siteId} type={type} />
      <p className="selection-meta">
        Builders: {builders} / {maxBuilders}
        {builders === 0 && ' · select serfs and right-click the site'}
      </p>
    </>
  );
}

/** Selected units: how many, and what they are doing. */
function UnitSelection({ ids }: { ids: readonly number[] }) {
  // A primitive selector result (a string), so the panel re-renders only when counts change.
  const summary = useGameStore((s) => {
    const wanted = new Set(ids);
    const counts = { idle: 0, walking: 0, working: 0 };
    for (const u of s.state.units) if (wanted.has(u.id)) counts[u.activity]++;
    return `${counts.idle + counts.walking + counts.working},${counts.idle},${counts.walking},${counts.working}`;
  });
  const [total = 0, idle = 0, walking = 0, working = 0] = summary.split(',').map(Number);
  if (total === 0) return null;
  return (
    <section className="hud-panel selection-panel" aria-label="Selection">
      <h2>{total === 1 ? 'Serf' : `${total} serfs`}</h2>
      <p className="selection-meta">
        {working} working · {walking} walking · {idle} idle
      </p>
      <p className="selection-meta">
        Right-click: move · a construction site: build · a tree or rock: gather
      </p>
    </section>
  );
}

/** Panel for the current selection: units, or a building with its actions. */
export function SelectionPanel() {
  const unitIds = useSelectionStore((s) => s.units);
  if (unitIds.length > 0) return <UnitSelection ids={unitIds} />;
  return <BuildingSelection />;
}

function BuildingSelection() {
  const buildingId = useSelectionStore((s) => s.building);
  const building = useGameStore((s) =>
    buildingId === null ? undefined : s.state.buildings.find((b) => b.id === buildingId),
  );
  if (!building) return null;

  const definition = BUILDINGS[building.type];
  const own = building.ownerId === LOCAL_PLAYER;
  return (
    <section className="hud-panel selection-panel" aria-label="Selection">
      <h2>{definition.name}</h2>
      {building.status === 'construction' ? (
        <SiteProgress
          siteId={building.id}
          type={building.type}
          maxBuilders={definition.maxBuilders}
        />
      ) : (
        <p className="selection-meta">{definition.description}</p>
      )}
      {own && building.type === 'townHall' && building.status === 'complete' && (
        <TownHallActions key={building.id} buildingId={building.id} />
      )}
    </section>
  );
}
