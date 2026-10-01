import { ALLOWED_PAUSES, ALLOWED_RATES } from './types';
import type { PauseSetting } from './types';

export type ThemeSetting = 'system' | 'light' | 'dark';
export type TextSize = 's' | 'm' | 'l';
/** Which titles to show: English only, the text's own language only, or both. */
export type TitleMode = 'both' | 'english' | 'native';

/** Defaults used for texts that have never been practiced. */
export interface PracticeDefaults {
  rate: number;
  pause: PauseSetting;
  /** 0 = forever. */
  count: number;
}

export interface AppSettings {
  theme: ThemeSetting;
  textSize: TextSize;
  titles: TitleMode;
  showTranslation: boolean;
  practiceDefaults: PracticeDefaults;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  textSize: 'm',
  titles: 'both',
  showTranslation: false,
  practiceDefaults: { rate: 1, pause: 2, count: 3 },
};

const oneOf = <T>(value: unknown, allowed: readonly T[], fallback: T): T =>
  (allowed as readonly unknown[]).includes(value) ? (value as T) : fallback;

const obj = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/**
 * Turns whatever was stored (possibly from an older version, or corrupted)
 * into valid settings, replacing anything invalid with the default.
 */
export function sanitizeSettings(raw: unknown): AppSettings {
  const r = obj(raw);
  const d = obj(r.practiceDefaults);
  const base = DEFAULT_SETTINGS;
  const count = typeof d.count === 'number' && Number.isInteger(d.count) && d.count >= 0 && d.count <= 99 ? d.count : base.practiceDefaults.count;
  return {
    theme: oneOf(r.theme, ['system', 'light', 'dark'] as const, base.theme),
    textSize: oneOf(r.textSize, ['s', 'm', 'l'] as const, base.textSize),
    titles: oneOf(r.titles, ['both', 'english', 'native'] as const, base.titles),
    showTranslation: typeof r.showTranslation === 'boolean' ? r.showTranslation : base.showTranslation,
    practiceDefaults: {
      rate: oneOf(d.rate, ALLOWED_RATES as readonly number[], base.practiceDefaults.rate),
      pause: oneOf(d.pause, ALLOWED_PAUSES, base.practiceDefaults.pause),
      count,
    },
  };
}
