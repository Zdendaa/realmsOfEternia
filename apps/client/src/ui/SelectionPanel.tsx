import { BUILDINGS, UNITS } from '@roe/game-data';
import type { CommandIssue } from '@roe/sim';
import { useState } from 'react';
import { LOCAL_PLAYER, useGameStore } from '../state/gameStore';
import { useSelectionStore } from '../state/selectionStore';

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

/** Panel for the current selection: name, owner state and available actions. */
export function SelectionPanel() {
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
      <p className="selection-meta">
        {building.status === 'construction' ? 'Under construction' : definition.description}
      </p>
      {own && building.type === 'townHall' && building.status === 'complete' && (
        <TownHallActions key={building.id} buildingId={building.id} />
      )}
    </section>
  );
}
