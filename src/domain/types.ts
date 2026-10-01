/**
 * Domain types. Nothing in src/domain may import from React, the DOM,
 * storage, or any other layer.
 */

/* ---------- Source documents (what a content package contains) ---------- */

export interface SegmentSource {
  id: string;
  text: string;
  translation?: string;
  speaker?: string;
}

export interface GroupSource {
  id: string;
  /** e.g. "Verse 3". The first number in the label is used to label segments (3A, 3B). */
  label?: string;
  segments: SegmentSource[];
}

export interface SectionSource {
  id: string;
  title?: string;
  /** Title in the text's own language, e.g. Arabic. */
  titleNative?: string;
  /** Optional heading that is itself recited (and therefore playable). */
  heading?: SegmentSource;
  groups?: GroupSource[];
  /** Segments that are not in a group. */
  segments?: SegmentSource[];
}

export interface ContentDoc {
  sections: SectionSource[];
}

export interface Manifest {
  schemaVersion: 1;
  contentId: string;
  version: number | string;
  title: string;
  titleNative?: string;
  language: string;
  contentType?: string;
  author?: string;
  /** Who recites or reads the audio. Shown next to the author. */
  reciter?: string;
  /** Publication date, "YYYY-MM-DD". Drives the "New" label; leave it out if unknown. */
  published?: string;
  /** File names inside the package. */
  audio?: string;
  content?: string;
  alignment?: string;
}

export interface TimeSpan {
  start: number;
  end: number;
}

export interface AlignmentDoc {
  /** Times in seconds, keyed by segment id. */
  segments: Record<string, TimeSpan>;
  /** Set true only if segments are meant to overlap. */
  allowOverlap?: boolean;
}

/* ---------- Flattened structure used at practice time ---------- */

export interface Segment {
  id: string;
  /** Position in the flattened, playback-ordered list. */
  index: number;
  text: string;
  translation: string;
  speaker: string;
  sectionIndex: number;
  /** Index into `groups`, or -1 when the segment is not in a group. */
  groupIndex: number;
  /** Position inside its group (0-based). */
  position: number;
  groupSize: number;
  isHeading: boolean;
  /** Short human label such as "1A", "7", or "Title". */
  label: string;
}

export interface TimedSegment extends Segment, TimeSpan {}

export interface SectionInfo {
  id: string;
  title: string;
  titleNative: string;
  first: number;
  last: number;
  /** Index of the playable heading segment, or -1. */
  headingIndex: number;
}

export interface GroupInfo {
  id: string;
  label: string;
  first: number;
  last: number;
  sectionIndex: number;
}

export interface ContentStructure<S extends Segment = Segment> {
  segments: S[];
  sections: SectionInfo[];
  groups: GroupInfo[];
}

/* ---------- Practice ---------- */

/** Inclusive [first, last] indexes into the flattened segment list. */
export type Range = readonly [number, number];

export type RepeatMode = 'segment' | 'range' | 'each';

/** Seconds of silence, or 'auto' = as long as what was just played ("recite" gap). */
export type PauseSetting = number | 'auto';

/** 0 means repeat forever. */
export const REPEAT_FOREVER = 0;

export interface PracticeConfig {
  mode: RepeatMode;
  /** How many times to repeat (REPEAT_FOREVER = never stop). */
  count: number;
  pause: PauseSetting;
  /** Playback speed multiplier. */
  rate: number;
  range: Range;
}

export interface Cursor {
  /** Index of the segment being played. */
  seg: number;
  /** 0-based repetition (or pass, in range mode) number. */
  rep: number;
}

export interface CursorStep {
  cursor: Cursor;
  /** True when the pause-between-repetitions should happen before playing `cursor`. */
  gap: boolean;
}

export const ALLOWED_RATES = [0.5, 0.75, 1, 1.25, 1.5] as const;
export const ALLOWED_PAUSES: readonly PauseSetting[] = [0, 1, 2, 3, 5, 'auto'];

/** Everything needed to start practicing: the config plus where to start. */
export interface PracticeSetup extends PracticeConfig {
  /** Index of the segment to start on. Always inside `range`. */
  seg: number;
}
