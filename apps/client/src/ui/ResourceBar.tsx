import { RESOURCE_IDS, RESOURCES, type ResourceAmounts, type ResourceId } from '@roe/game-data';
import { EMPTY_STOCK } from '@roe/sim';
import { useState } from 'react';
import { LOCAL_PLAYER, useGameStore } from '../state/gameStore';
import { RESOURCE_ICONS } from './icons/resourceIcons';

/** The last change per resource; `serial` restarts the flash animation. */
type Flashes = Partial<Record<ResourceId, { delta: number; serial: number }>>;

function nextFlashes(
  before: Readonly<ResourceAmounts>,
  after: Readonly<ResourceAmounts>,
  flashes: Flashes,
): Flashes {
  const next = { ...flashes };
  for (const id of RESOURCE_IDS) {
    const delta = after[id] - before[id];
    if (delta !== 0) next[id] = { delta, serial: (flashes[id]?.serial ?? 0) + 1 };
  }
  return next;
}

/**
 * Top resource bar: the local player's stock. It re-renders only when the stock object
 * changes (payments, deliveries), never per tick; each change flashes its +/- delta.
 */
export function ResourceBar() {
  const stock = useGameStore((s) => s.state.stocks[LOCAL_PLAYER] ?? EMPTY_STOCK);
  // Previous stock kept in state and compared during render (React's "adjust state
  // when a prop changes" pattern): no effect, no extra commit.
  const [previous, setPrevious] = useState(stock);
  const [flashes, setFlashes] = useState<Flashes>({});
  if (stock !== previous) {
    setPrevious(stock);
    setFlashes(nextFlashes(previous, stock, flashes));
  }

  return (
    <section className="hud-panel resource-bar" aria-label="Resources">
      <ul>
        {RESOURCE_IDS.map((id) => {
          const flash = flashes[id];
          return (
            <li key={id} title={RESOURCES[id].name}>
              <img src={RESOURCE_ICONS[id]} alt={RESOURCES[id].name} width={22} height={22} />
              <span className="resource-amount">{stock[id]}</span>
              {flash && (
                <span
                  key={flash.serial}
                  className={`resource-delta ${flash.delta > 0 ? 'is-gain' : 'is-loss'}`}
                  aria-hidden="true"
                >
                  {flash.delta > 0 ? `+${flash.delta}` : flash.delta}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
