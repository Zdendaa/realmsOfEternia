import type { PlayerId } from '@roe/shared';
import { Color } from 'three';
import { LOCAL_PLAYER } from '../../state/gameStore';

/** Tunic colors: the local player, then other players by order of appearance. */
const LOCAL_COLOR = new Color('#3f6fb8');
const OTHER_COLORS = ['#b8423f', '#3f9a55', '#c9a23a'].map((c) => new Color(c));
const NEUTRAL_COLOR = new Color('#8a7a62');

const assigned = new Map<PlayerId, Color>();

export function ownerColor(owner: PlayerId | null): Color {
  if (owner === null) return NEUTRAL_COLOR;
  if (owner === LOCAL_PLAYER) return LOCAL_COLOR;
  let color = assigned.get(owner);
  if (!color) {
    color = OTHER_COLORS[assigned.size % OTHER_COLORS.length] as Color;
    assigned.set(owner, color);
  }
  return color;
}
