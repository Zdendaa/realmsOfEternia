import {
  BUILDINGS,
  productionOf,
  RESOURCE_NODES,
  RESOURCES,
  trainsOf,
  UNITS,
  type ProductionDefinition,
  type ResourceId,
} from '@roe/game-data';
import { SIMULATION_TICK_RATE } from '@roe/shared';
import {
  awaitsWorker,
  buildingMaxHealth,
  EMPTY_STOCK,
  fieldOf,
  isRipe,
  plotCount,
  missingResources,
  populationOf,
  type BuildingInstance,
  type CommandIssue,
  type WorkPhase,
} from '@roe/sim';
import { useState } from 'react';
import { LOCAL_PLAYER, useGameStore } from '../state/gameStore';
import { useSelectionStore } from '../state/selectionStore';
import { CostList } from './CostList';
import { RESOURCE_ICONS } from './icons/resourceIcons';
import { TrainingPanel } from './TrainingPanel';
import { UnitPanel } from './UnitPanel';

const ISSUE_MESSAGES: Partial<Record<CommandIssue, string>> = {
  unitLimit: `You already have ${UNITS.serf.maxPerPlayer} serfs.`,
  underConstruction: 'The Town Hall is not finished yet.',
  notOwner: 'This building belongs to someone else.',
  noHousing: 'No free housing: build a house first.',
  notEnoughResources: 'Not enough food.',
};

/** Why recruiting is not possible right now (checked live, so the button can be disabled). */
function recruitBlocker(serfs: number, used: number, capacity: number, foodShort: boolean) {
  if (serfs >= UNITS.serf.maxPerPlayer) return 'unitLimit';
  if (used >= capacity) return 'noHousing';
  if (foodShort) return 'notEnoughResources';
  return null;
}

/**
 * Recruiting at the selected Town Hall: cost, population, and the reason when it isn't
 * possible (no free housing, not enough food). Re-renders only when those change.
 */
function TownHallActions({ buildingId }: { buildingId: number }) {
  const dispatch = useGameStore((s) => s.dispatch);
  const stock = useGameStore((s) => s.state.stocks[LOCAL_PLAYER] ?? EMPTY_STOCK);
  const summary = useGameStore((s) => {
    const { used, capacity } = populationOf(s.state, LOCAL_PLAYER);
    let serfs = 0;
    for (const u of s.state.units) if (u.type === 'serf' && u.ownerId === LOCAL_PLAYER) serfs++;
    return `${serfs},${used},${capacity}`;
  });
  const [serfs = 0, used = 0, capacity = 0] = summary.split(',').map(Number);
  const [rejected, setRejected] = useState<CommandIssue | null>(null);

  const cost = UNITS.serf.cost;
  const blocker = recruitBlocker(serfs, used, capacity, missingResources(stock, cost).length > 0);
  const issue = blocker ?? rejected;

  const recruit = () => {
    const check = dispatch({ type: 'recruitSerf', buildingId });
    setRejected(check.ok ? null : (check.issues[0] ?? null));
  };

  return (
    <>
      <p className="selection-meta">
        Serfs: {serfs} · population {used} / {capacity}
      </p>
      <div className="selection-action-row">
        <button
          type="button"
          className="selection-action"
          onClick={recruit}
          disabled={blocker !== null}
        >
          Recruit serf
        </button>
        <CostList cost={cost} stock={stock} />
      </div>
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

/**
 * What a worker is doing, by production kind and phase; `{node}` and `{goods}` depend
 * on the building. Phases a kind never uses are left out.
 */
const WORK_PHASES: Record<ProductionDefinition['kind'], Partial<Record<WorkPhase, string>>> = {
  harvest: {
    waiting: 'Waiting: no {node}s within reach',
    toNode: 'Walking to a {node}',
    working: 'Harvesting a {node}',
    toBuilding: 'Bringing {goods} back',
    processing: 'Preparing {goods}',
    toStorage: 'Carrying {goods} to storage',
  },
  farm: {
    waiting: 'Waiting for the {goods} to ripen',
    toPlot: 'Walking to the next plot',
    sowing: 'Sowing',
    harvesting: 'Reaping {goods}',
    toStorage: 'Carrying {goods} to storage',
  },
  process: {
    waiting: 'Waiting for {input} in storage',
    fetching: 'Fetching {input} from storage',
    toBuilding: 'Bringing {input} in',
    processing: 'Making {goods} inside',
    toStorage: 'Carrying {goods} to storage',
  },
};

/** What a production building makes, for the worker texts. */
function workWords(production: ProductionDefinition) {
  const name = (id: ResourceId) => RESOURCES[id].name.toLowerCase();
  switch (production.kind) {
    case 'harvest':
      return {
        node: production.node,
        goods: name(RESOURCE_NODES[production.node].resource),
        input: '',
      };
    case 'farm':
      return { node: 'plot', goods: name(production.crop), input: '' };
    case 'process':
      return {
        node: '',
        goods: name(production.output.resource),
        input: name(production.input.resource),
      };
  }
}

/**
 * A field's cycle: plots sown or harvested, or the seconds until the crop is ripe
 * (re-renders when that text changes, at most once per second).
 */
function FieldProgress({ buildingId, type }: { buildingId: number; type: keyof typeof BUILDINGS }) {
  const plots = plotCount(type);
  const text = useGameStore((s) => {
    const field = fieldOf(s.state.fields, buildingId);
    switch (field.phase) {
      case 'sowing':
        return `Sowing: ${field.plotsDone} / ${plots} plots`;
      case 'harvesting':
        return `Harvest: ${field.plotsDone} / ${plots} plots`;
      case 'growing': {
        if (isRipe(field, s.state.tick)) return `Ripe: ready for harvest`;
        const seconds = Math.ceil((field.ripeAt - s.state.tick) / SIMULATION_TICK_RATE);
        return `Growing: ripe in ${seconds} s`;
      }
    }
  });
  return <p className="selection-meta">{text}</p>;
}

/**
 * The worker of a production building and what it does, or that it waits for housing
 * (re-renders when the phase changes).
 */
function WorkerStatus({ buildingId, type }: { buildingId: number; type: keyof typeof BUILDINGS }) {
  const phase = useGameStore((s) => {
    const worker = s.state.units.find(
      (u) => u.task.kind === 'work' && u.task.buildingId === buildingId,
    );
    if (worker?.task.kind === 'work') return worker.task.phase;
    const building = s.state.buildings.find((b) => b.id === buildingId);
    return building && awaitsWorker(building, s.state.units) ? 'awaitsHousing' : null;
  });
  const production = productionOf(type);
  if (!production) return null;
  if (!phase) return <p className="selection-meta">No worker</p>;
  if (phase === 'awaitsHousing') {
    return (
      <p className="selection-issue">Worker: waiting for housing. Build a house to make room.</p>
    );
  }
  const words = workWords(production);
  const text = (WORK_PHASES[production.kind][phase] ?? phase)
    .replace('{node}', words.node)
    .replace('{goods}', words.goods)
    .replace('{input}', words.input);
  return <p className="selection-meta">Worker: {text}</p>;
}

/** Panel for the current selection: units, or a building with its actions. */
export function SelectionPanel() {
  const unitIds = useSelectionStore((s) => s.units);
  if (unitIds.length > 0) return <UnitPanel ids={unitIds} />;
  return <BuildingSelection />;
}

/** A damaged building's health (hidden while unhurt). */
function BuildingHealth({ building }: { building: BuildingInstance }) {
  const summary = useGameStore((s) => {
    const damage = s.state.buildingDamage[building.id] ?? 0;
    if (damage === 0) return '';
    const max = buildingMaxHealth(building, s.state.construction[building.id]);
    return `${Math.max(0, max - damage)}/${max}`;
  });
  if (!summary) return null;
  const [left = 0, max = 1] = summary.split('/').map(Number);
  return (
    <>
      <div className="unit-health" title={`Health ${left} / ${max}`}>
        <span style={{ width: `${(left / max) * 100}%` }} />
      </div>
      <p className="selection-meta">
        Health {left} / {max}
      </p>
    </>
  );
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
      <BuildingHealth building={building} />
      {building.status === 'construction' ? (
        <SiteProgress
          siteId={building.id}
          type={building.type}
          maxBuilders={definition.maxBuilders}
        />
      ) : (
        <>
          <p className="selection-meta">{definition.description}</p>
          {productionOf(building.type)?.kind === 'farm' && (
            <FieldProgress buildingId={building.id} type={building.type} />
          )}
          {own && <WorkerStatus buildingId={building.id} type={building.type} />}
        </>
      )}
      {own && building.type === 'townHall' && building.status === 'complete' && (
        <TownHallActions key={building.id} buildingId={building.id} />
      )}
      {own && building.status === 'complete' && trainsOf(building.type).length > 0 && (
        <TrainingPanel key={building.id} buildingId={building.id} type={building.type} />
      )}
    </section>
  );
}
