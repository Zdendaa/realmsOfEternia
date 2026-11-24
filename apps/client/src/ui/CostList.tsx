import {
  RESOURCES,
  type ResourceAmounts,
  type ResourceCost,
  type ResourceId,
} from '@roe/game-data';
import { RESOURCE_ICONS } from './icons/resourceIcons';

/** A compact cost line (icon + amount per resource); amounts the stock can't cover are red. */
export function CostList({
  cost,
  stock,
}: {
  cost: ResourceCost;
  stock: Readonly<ResourceAmounts>;
}) {
  const entries = Object.entries(cost) as [ResourceId, number][];
  return (
    <ul className="cost-list">
      {entries.map(([resource, amount]) => (
        <li
          key={resource}
          className={`cost ${stock[resource] < amount ? 'is-short' : ''}`}
          title={`${amount} ${RESOURCES[resource].name}`}
        >
          <img
            src={RESOURCE_ICONS[resource]}
            alt={RESOURCES[resource].name}
            width={12}
            height={12}
          />
          {amount}
        </li>
      ))}
    </ul>
  );
}
