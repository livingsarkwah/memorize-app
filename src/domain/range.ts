import type { ContentStructure, Range } from './types';

/**
 * Validates and orders a range. Returns null for anything that is not a
 * pair of in-bounds integers (so callers never store a bad range).
 */
export function normalizeRange(a: number, b: number, length: number): Range | null {
  if (!Number.isInteger(a) || !Number.isInteger(b) || length < 1) return null;
  if (a < 0 || b < 0 || a >= length || b >= length) return null;
  return a <= b ? [a, b] : [b, a];
}

/** The verse (group) containing segment `i`, or just `i` if it is not grouped. */
export function rangeOfGroup(structure: ContentStructure, i: number): Range {
  const s = structure.segments[i];
  if (s && s.groupIndex >= 0) {
    const g = structure.groups[s.groupIndex];
    if (g) return [g.first, g.last];
  }
  return [i, i];
}

/** The whole section containing segment `i`, including a playable heading. */
export function rangeOfSection(structure: ContentStructure, i: number): Range {
  const sec = structure.sections[structure.segments[i]?.sectionIndex ?? -1];
  return sec ? [sec.first, sec.last] : [i, i];
}

/** Where practice starts on a text nobody has practiced yet: the first verse. */
export function defaultRange(structure: ContentStructure): Range {
  const startsWithHeading = structure.segments[0]?.isHeading && structure.segments.length > 1;
  return rangeOfGroup(structure, startsWithHeading ? 1 : 0);
}
