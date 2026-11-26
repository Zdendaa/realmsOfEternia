import type { Vec2 } from '@roe/shared';
import { commandFeedback } from '../render/commands/commandFeedback';
import { useGameStore } from '../state/gameStore';

/**
 * Orders to a point on the ground, from the 3D view or the minimap. `destination` is
 * where the marker shows: where the units end up (the shore for a click into water).
 */
export function orderToGround(
  type: 'moveUnits' | 'attackMove',
  unitIds: readonly number[],
  point: Vec2,
  destination: Vec2,
): void {
  const { dispatch, heights } = useGameStore.getState();
  const result = dispatch({ type, unitIds: [...unitIds], x: point.x, z: point.z });
  if (!result.ok) return;
  const { x, z } = destination;
  const marker = { kind: 'move' as const, x, y: heights.getHeightAt(x, z), z };
  commandFeedback.push(type === 'attackMove' ? { ...marker, attack: true } : marker);
}
