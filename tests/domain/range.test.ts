import { describe, expect, it } from 'vitest';
import { defaultRange, flatten, normalizeRange, rangeOfGroup, rangeOfSection } from '../../src/domain';
import { shortToast } from '../../src/samples/shortToast';
import { tuhfatulAtfaal } from '../../src/samples/tuhfatulAtfaal';

describe('normalizeRange', () => {
  it('puts a reversed selection in order', () => expect(normalizeRange(5, 2, 10)).toEqual([2, 5]));
  it('accepts a single segment', () => expect(normalizeRange(3, 3, 10)).toEqual([3, 3]));
  it('rejects out-of-bounds values, non-integers and empty lists', () => {
    expect(normalizeRange(-1, 2, 10)).toBeNull();
    expect(normalizeRange(0, 10, 10)).toBeNull();
    expect(normalizeRange(NaN, 2, 10)).toBeNull();
    expect(normalizeRange(1.5, 2, 10)).toBeNull();
    expect(normalizeRange(0, 0, 0)).toBeNull();
  });
});

describe('range helpers on real content', () => {
  const tuhfa = flatten(tuhfatulAtfaal);

  it('rangeOfGroup returns the whole verse', () => {
    expect(rangeOfGroup(tuhfa, 3)).toEqual([2, 3]); // v2b → v2a..v2b
  });

  it('rangeOfGroup returns just the segment when it is not grouped', () => {
    const toast = flatten(shortToast);
    expect(rangeOfGroup(toast, 4)).toEqual([4, 4]);
  });

  it('rangeOfSection includes a playable heading', () => {
    const noon = tuhfa.sections[1]!;
    expect(rangeOfSection(tuhfa, noon.first + 3)).toEqual([noon.first, noon.last]);
    expect(tuhfa.segments[noon.first]!.isHeading).toBe(true);
  });

  it('defaultRange is the first verse', () => {
    expect(defaultRange(tuhfa)).toEqual([0, 1]);
    expect(defaultRange(flatten(shortToast))).toEqual([0, 0]);
  });
});
