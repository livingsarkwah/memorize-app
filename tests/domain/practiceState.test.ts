import { describe, expect, it } from 'vitest';
import { flatten, resolvePracticeSetup, toPracticeState } from '../../src/domain';
import type { PracticeState } from '../../src/domain';
import { tuhfatulAtfaal } from '../../src/samples/tuhfatulAtfaal';

const structure = flatten(tuhfatulAtfaal);
const defaults = { rate: 1, pause: 2, count: 3 } as const;
const saved = (over: Partial<PracticeState> = {}): PracticeState => ({
  itemId: 'tuhfatul-atfaal', lastSegmentId: 'v3b', rangeStartId: 'v3a', rangeEndId: 'v4b',
  mode: 'each', count: 5, pause: 'auto', rate: 0.75, lastPlayedAt: 123, ...over,
});

describe('resolvePracticeSetup', () => {
  it('starts a new text on its first verse with the default settings', () => {
    expect(resolvePracticeSetup(structure, undefined, defaults)).toEqual({ seg: 0, range: [0, 1], mode: 'range', count: 3, pause: 2, rate: 1 });
  });

  it('restores saved progress', () => {
    expect(resolvePracticeSetup(structure, saved(), defaults)).toEqual({ seg: 5, range: [4, 7], mode: 'each', count: 5, pause: 'auto', rate: 0.75 });
  });

  it('falls back to the first verse when the saved segments no longer exist', () => {
    const s = resolvePracticeSetup(structure, saved({ rangeStartId: 'gone', rangeEndId: 'also-gone' }), defaults);
    expect(s.range).toEqual([0, 1]);
    expect(s.seg).toBe(0);
  });

  it('moves the position to the start of the range if it fell outside it', () => {
    expect(resolvePracticeSetup(structure, saved({ lastSegmentId: 'v1a' }), defaults).seg).toBe(4);
    expect(resolvePracticeSetup(structure, saved({ lastSegmentId: 'missing' }), defaults).seg).toBe(4);
  });

  it('accepts a range saved in reverse order', () => {
    expect(resolvePracticeSetup(structure, saved({ rangeStartId: 'v4b', rangeEndId: 'v3a', lastSegmentId: 'v4a' }), defaults).range).toEqual([4, 7]);
  });

  it('replaces invalid saved settings with the defaults', () => {
    const s = resolvePracticeSetup(structure, saved({ mode: 'nonsense' as never, count: 500, pause: 7 as never, rate: 2 }), defaults);
    expect(s).toMatchObject({ mode: 'range', count: 3, pause: 2, rate: 1 });
  });

  it('follows the segments by id when content is edited and positions shift', () => {
    const edited = flatten({
      sections: [{ id: 'new', segments: [{ id: 'extra1', text: 'a' }, { id: 'extra2', text: 'b' }] }, ...tuhfatulAtfaal.sections],
    });
    const s = resolvePracticeSetup(edited, saved(), defaults);
    expect(edited.segments[s.seg]!.id).toBe('v3b');
    expect(edited.segments[s.range[0]]!.id).toBe('v3a');
    expect(edited.segments[s.range[1]]!.id).toBe('v4b');
  });
});

describe('toPracticeState', () => {
  it('records segments by id', () => {
    const state = toPracticeState('tuhfatul-atfaal', structure.segments, 5, { mode: 'each', count: 5, pause: 'auto', rate: 0.75, range: [4, 7] }, 999);
    expect(state).toEqual(saved({ lastPlayedAt: 999 }));
  });
});
