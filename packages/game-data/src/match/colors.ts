/** The colors a seat in a match can have (tunics, banners, minimap). */
export const PLAYER_COLORS = {
  blue: { name: 'Blue', hex: '#3f6fb8' },
  red: { name: 'Red', hex: '#b8423f' },
  green: { name: 'Green', hex: '#3f9a55' },
  yellow: { name: 'Yellow', hex: '#c9a23a' },
} as const satisfies Record<string, { name: string; hex: string }>;

export type PlayerColorId = keyof typeof PLAYER_COLORS;

export const PLAYER_COLOR_IDS = Object.keys(PLAYER_COLORS) as PlayerColorId[];
