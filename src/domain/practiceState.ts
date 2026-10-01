import { defaultRange, normalizeRange } from './range';
import type { PracticeDefaults } from './settings';
import { ALLOWED_PAUSES, ALLOWED_RATES } from './types';
import type { ContentStructure, PauseSetting, PracticeConfig, PracticeSetup, RepeatMode, Segment } from './types';

/**
 * Saved practice progress for one text. It refers to segments by id (not by
 * position), so it survives a content update that adds or reorders segments.
 */
export interface PracticeState {
  itemId: string;
  lastSegmentId: string;
  rangeStartId: string;
  rangeEndId: string;
  mode: RepeatMode;
  count: number;
  pause: PauseSetting;
  rate: number;
  /** Epoch ms of the last time playback started or stopped. Undefined = never practiced. */
  lastPlayedAt?: number;
}

const MODES: readonly RepeatMode[] = ['segment', 'range', 'each'];

/**
 * Works out where to start: the saved state where it is still valid,
 * the first verse and the default settings otherwise.
 */
export function resolvePracticeSetup(
  structure: ContentStructure,
  saved: PracticeState | undefined,
  defaults: PracticeDefaults,
): PracticeSetup {
  const byId = new Map(structure.segments.map((s) => [s.id, s.index]));
  const range =
    (saved && normalizeRange(byId.get(saved.rangeStartId) ?? -1, byId.get(saved.rangeEndId) ?? -1, structure.segments.length)) ||
    defaultRange(structure);
  let seg = saved ? byId.get(saved.lastSegmentId) : undefined;
  if (seg === undefined || seg < range[0] || seg > range[1]) seg = range[0];

  return {
    seg,
    range,
    mode: saved && MODES.includes(saved.mode) ? saved.mode : 'range',
    count: saved && Number.isInteger(saved.count) && saved.count >= 0 && saved.count <= 99 ? saved.count : defaults.count,
    pause: saved && ALLOWED_PAUSES.includes(saved.pause) ? saved.pause : defaults.pause,
    rate: saved && (ALLOWED_RATES as readonly number[]).includes(saved.rate) ? saved.rate : defaults.rate,
  };
}

/** Builds the state to store from the engine's current position and settings. */
export function toPracticeState(
  itemId: string,
  segments: readonly Segment[],
  seg: number,
  config: PracticeConfig,
  lastPlayedAt: number | undefined,
): PracticeState {
  return {
    itemId,
    lastSegmentId: segments[seg]!.id,
    rangeStartId: segments[config.range[0]]!.id,
    rangeEndId: segments[config.range[1]]!.id,
    mode: config.mode,
    count: config.count,
    pause: config.pause,
    rate: config.rate,
    lastPlayedAt,
  };
}
