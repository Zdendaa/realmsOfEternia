import { HERO_RULES } from '@roe/game-data';

/** A hero's way to the next level, for a bar and its words. */
export function experienceProgress(level: number, experience: number) {
  const from = HERO_RULES.levelExperience[level - 1] ?? 0;
  const to = HERO_RULES.levelExperience[level];
  if (to === undefined) return { share: 1, text: 'Top level' };
  return {
    share: Math.min(1, Math.max(0, (experience - from) / (to - from))),
    text: `${experience} / ${to} experience`,
  };
}
