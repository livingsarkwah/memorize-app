import { describe, expect, it } from 'vitest';
import { nextCursor } from '../../src/domain';
import type { Cursor, PracticeConfig } from '../../src/domain';

type Cfg = Pick<PracticeConfig, 'mode' | 'range' | 'count'>;

/** Follow the cursor until practice ends (or `limit` steps), recording pauses as 'gap'. */
function trace(cfg: Cfg, start: Cursor, limit = 60): (string | [number, number])[] {
  const out: (string | [number, number])[] = [[start.seg, start.rep]];
  let cur = start;
  for (let i = 0; i < limit; i++) {
    const step = nextCursor(cfg, cur);
    if (!step) break;
    if (step.gap) out.push('gap');
    cur = step.cursor;
    out.push([cur.seg, cur.rep]);
  }
  return out;
}

describe('nextCursor', () => {
  it('repeat segment: plays it N times with a pause between', () => {
    expect(trace({ mode: 'segment', range: [2, 4], count: 3 }, { seg: 2, rep: 0 })).toEqual([[2, 0], 'gap', [2, 1], 'gap', [2, 2]]);
  });

  it('repeat range: plays first to last, pausing only between passes', () => {
    expect(trace({ mode: 'range', range: [1, 2], count: 2 }, { seg: 1, rep: 0 })).toEqual([[1, 0], [2, 0], 'gap', [1, 1], [2, 1]]);
  });

  it('repeat each: finishes one segment before moving to the next', () => {
    expect(trace({ mode: 'each', range: [1, 2], count: 2 }, { seg: 1, rep: 0 })).toEqual([[1, 0], 'gap', [1, 1], [2, 0], 'gap', [2, 1]]);
  });

  it('a count of 0 repeats forever', () => {
    expect(trace({ mode: 'range', range: [0, 1], count: 0 }, { seg: 0, rep: 0 }, 50).length).toBeGreaterThanOrEqual(50);
  });

  it('a count of 1 plays once and stops', () => {
    expect(trace({ mode: 'segment', range: [0, 0], count: 1 }, { seg: 0, rep: 0 })).toEqual([[0, 0]]);
  });

  it('a range of one segment in range mode repeats that segment', () => {
    expect(trace({ mode: 'range', range: [3, 3], count: 2 }, { seg: 3, rep: 0 })).toEqual([[3, 0], 'gap', [3, 1]]);
  });

  it('starting mid-range finishes the pass, then loops back to the start', () => {
    expect(trace({ mode: 'range', range: [1, 3], count: 2 }, { seg: 2, rep: 0 })).toEqual([[2, 0], [3, 0], 'gap', [1, 1], [2, 1], [3, 1]]);
  });
});
