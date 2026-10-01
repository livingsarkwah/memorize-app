import { describe, expect, it } from 'vitest';
import { directionOf, languageName, practiceSummary, rangeLabel, timeAgo, titleParts, typeLine } from '../../src/ui/format';
import { ringArcs } from '../../src/ui/ring';

describe('directionOf', () => {
  it('is rtl for Arabic, Hebrew, Persian and Urdu, including regional codes', () => {
    for (const l of ['ar', 'he', 'fa', 'ur', 'ar-EG', 'AR']) expect(directionOf(l)).toBe('rtl');
    for (const l of ['en', 'es', 'fr', 'zh']) expect(directionOf(l)).toBe('ltr');
  });
});

describe('timeAgo', () => {
  const now = 1_000_000_000_000;
  it.each([
    [30_000, 'just now'], [5 * 60_000, '5 min ago'], [3 * 3600_000, '3 h ago'],
    [30 * 3600_000, 'yesterday'], [3 * 86_400_000, '3 days ago'],
  ])('%i ms ago → %s', (ms, text) => expect(timeAgo(now - ms, now)).toBe(text));
  it('shows a date after a week', () => expect(timeAgo(now - 30 * 86_400_000, now)).toMatch(/\d/));
  it('never goes negative for a timestamp in the future', () => expect(timeAgo(now + 5000, now)).toBe('just now'));
});

describe('text helpers', () => {
  it('names languages and describes a text', () => {
    expect(languageName('ar')).toBe('Arabic');
    expect(typeLine({ language: 'es', contentType: 'dialogue', segmentCount: 7 })).toBe('Spanish dialogue, 7 segments');
  });

  it('labels a single segment or a range', () => {
    const segs = [{ label: '1A' }, { label: '1B' }, { label: '2A' }];
    expect(rangeLabel(segs, 1, 1)).toBe('1B');
    expect(rangeLabel(segs, 0, 2)).toBe('1A–2A');
  });

  it('chooses titles by mode, never leaving a text without a title', () => {
    expect(titleParts('Tuhfa', 'تحفة', 'both')).toEqual({ english: 'Tuhfa', native: 'تحفة' });
    expect(titleParts('Tuhfa', 'تحفة', 'english')).toEqual({ english: 'Tuhfa', native: undefined });
    expect(titleParts('Tuhfa', 'تحفة', 'native')).toEqual({ english: undefined, native: 'تحفة' });
    expect(titleParts('A Toast', '', 'native')).toEqual({ english: 'A Toast', native: undefined });
  });

  it('summarizes practice in plain language', () => {
    expect(practiceSummary({ mode: 'range', count: 3, rate: 1 }, '1A–1B', false, false)).toBe('Segments 1A to 1B, repeat the range 3 times at 1×');
    expect(practiceSummary({ mode: 'segment', count: 1, rate: 0.75 }, '4', true, false)).toBe('Segment 4, repeat the segment 1 time at 0.75×');
    expect(practiceSummary({ mode: 'each', count: 0, rate: 1 }, 'Title', true, true)).toBe('The section title, repeat each segment forever at 1×');
  });
});

describe('ringArcs', () => {
  it('draws one arc per segment for short texts, and at most 36 for long ones', () => {
    expect(ringArcs(8)).toHaveLength(8);
    expect(ringArcs(200)).toHaveLength(36);
    expect(ringArcs(1)).toHaveLength(2);
  });

  it('marks the range and the current segment', () => {
    const kinds = ringArcs(8, { range: [2, 4], current: 3 }).map((a) => a.kind);
    expect(kinds).toEqual(['base', 'base', 'range', 'current', 'range', 'base', 'base', 'base']);
  });

  it('maps segments to arcs proportionally when they are grouped', () => {
    const arcs = ringArcs(72, { range: [0, 1] });
    expect(arcs.filter((a) => a.kind === 'range')).toHaveLength(1);
  });

  it('produces valid path data', () => {
    for (const arc of ringArcs(5)) expect(arc.d).toMatch(/^M[\d. -]+A40 40 0 [01] 1 [\d. -]+$/);
  });
});
