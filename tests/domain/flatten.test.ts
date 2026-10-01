import { describe, expect, it } from 'vitest';
import { applyAlignment, flatten } from '../../src/domain';
import { cafeDialogue } from '../../src/samples/cafeDialogue';
import { tuhfatulAtfaal } from '../../src/samples/tuhfatulAtfaal';

describe('flatten', () => {
  const tuhfa = flatten(tuhfatulAtfaal);

  it('orders segments section by section, heading first', () => {
    expect(tuhfa.segments).toHaveLength(17);
    expect(tuhfa.segments.map((s) => s.index)).toEqual([...Array(17).keys()]);
    expect(tuhfa.sections.map((s) => [s.first, s.last])).toEqual([[0, 9], [10, 16]]);
    expect(tuhfa.sections[1]!.headingIndex).toBe(10);
    expect(tuhfa.sections[0]!.headingIndex).toBe(-1);
  });

  it('labels the halves of each verse 1A, 1B, 2A ...', () => {
    expect(tuhfa.segments.slice(0, 4).map((s) => s.label)).toEqual(['1A', '1B', '2A', '2B']);
    expect(tuhfa.segments[10]!.label).toBe('Title');
    expect(tuhfa.segments[11]!.label).toBe('6A');
  });

  it('records verse boundaries', () => {
    expect(tuhfa.groups).toHaveLength(8);
    expect(tuhfa.groups[2]).toMatchObject({ id: 'v3', first: 4, last: 5, sectionIndex: 0 });
  });

  it('numbers ungrouped segments 1, 2, 3 and keeps speakers and translations', () => {
    const cafe = flatten(cafeDialogue);
    expect(cafe.segments.map((s) => s.label)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    expect(cafe.segments[1]).toMatchObject({ speaker: 'Clienta', groupIndex: -1 });
    expect(cafe.segments[0]!.translation).toMatch(/Good afternoon/);
  });

  it('does not throw on malformed content', () => {
    expect(() => flatten({ sections: [null as never, { id: 'x', groups: [null as never] }] })).not.toThrow();
    expect(flatten({} as never).segments).toEqual([]);
  });
});

describe('applyAlignment', () => {
  it('attaches start and end to each segment', () => {
    const { segments } = flatten(cafeDialogue);
    const alignment = { segments: Object.fromEntries(segments.map((s, i) => [s.id, { start: i, end: i + 0.5 }])) };
    const timed = applyAlignment(segments, alignment);
    expect(timed[2]).toMatchObject({ id: 'c3', start: 2, end: 2.5 });
  });

  it('throws when a segment has no timing', () => {
    const { segments } = flatten(cafeDialogue);
    expect(() => applyAlignment(segments, { segments: {} })).toThrow(/c1/);
  });
});
