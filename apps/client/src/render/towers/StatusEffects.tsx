import { useGameStore } from '../../state/gameStore';
import { SmokePuffs, type SmokeEmitter, type SmokeStyle } from '../scene/SmokePuffs';
import { renderedUnits } from '../units/renderedUnits';

/** Flames licking up from a burning unit. */
const FLAMES: SmokeStyle = {
  color: '#ff7a1f',
  opacity: 0.8,
  maxPuffs: 320,
  emitEvery: 0.09,
  lifetime: 0.7,
  rise: 1.8,
  drift: 0.2,
  startSize: 0.42,
  endSize: 0.1,
};
/** A violet haze at the feet of a slowed unit. */
const HAZE: SmokeStyle = {
  color: '#a86cff',
  opacity: 0.35,
  maxPuffs: 160,
  emitEvery: 0.25,
  lifetime: 0.9,
  rise: 0.6,
  drift: 0.3,
  startSize: 0.22,
  endSize: 0.4,
};

/** Where the visible units with `effect` are this frame. */
function emittersOf(effect: 'burning' | 'slowed', lift: number): SmokeEmitter[] {
  const out: SmokeEmitter[] = [];
  for (const unit of useGameStore.getState().state.units) {
    if (!unit[effect]) continue;
    // Only units that are drawn (the fog of war hides the others).
    const drawn = renderedUnits.get(unit.id);
    if (drawn) out.push({ id: unit.id, x: drawn.x, y: drawn.y + lift, z: drawn.z });
  }
  return out;
}

const burning = () => emittersOf('burning', 1.5);
const slowed = () => emittersOf('slowed', 0.2);

/** What the magic and fire towers leave on units (cosmetic). */
export function StatusEffects() {
  return (
    <>
      <SmokePuffs emitters={burning} style={FLAMES} />
      <SmokePuffs emitters={slowed} style={HAZE} />
    </>
  );
}
