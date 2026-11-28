import { PLAYER_COLORS } from '@roe/game-data';
import type { PlayerId } from '@roe/shared';
import { Color } from 'three';
import { MATCH } from '../../state/matchConfig';

/** Tunic colors: each seat's own; other owners (monsters, dev spawns) as they appear. */
const SEAT_COLORS = new Map<PlayerId, Color>(
  MATCH.setup.seats.map((seat) => [seat.player, new Color(PLAYER_COLORS[seat.color].hex)]),
);
const OTHER_COLORS = [PLAYER_COLORS.red, PLAYER_COLORS.green, PLAYER_COLORS.yellow].map(
  (c) => new Color(c.hex),
);
const NEUTRAL_COLOR = new Color('#8a7a62');

const assigned = new Map<PlayerId, Color>();

export function ownerColor(owner: PlayerId | null): Color {
  if (owner === null) return NEUTRAL_COLOR;
  let color = SEAT_COLORS.get(owner) ?? assigned.get(owner);
  if (!color) {
    color = OTHER_COLORS[assigned.size % OTHER_COLORS.length] as Color;
    assigned.set(owner, color);
  }
  return color;
}
