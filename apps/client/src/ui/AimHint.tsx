import { abilityOf } from '@roe/game-data';
import { useCommandModeStore } from '../state/commandModeStore';

/** What to do while an ability waits for its target, and why a spot won't work. */
export function AimHint() {
  const aim = useCommandModeStore((s) => s.aim);
  const problem = useCommandModeStore((s) => s.feedback?.problem ?? null);
  if (!aim) return null;
  const ability = abilityOf(aim.ability);
  return (
    <div className="hud-panel aim-hint" role="status">
      <strong>{ability.name}</strong>
      {ability.target === 'building' ? ' · click an enemy building or wall' : ' · click a spot'} ·
      right click or Esc cancels
      {problem && <span className="aim-problem">{problem}</span>}
    </div>
  );
}
