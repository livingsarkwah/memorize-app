import { REPEAT_FOREVER } from './types';
import type { Cursor, CursorStep, PracticeConfig } from './types';

/**
 * The heart of the practice rules: what happens after a segment finishes playing?
 *
 *  - 'segment': repeat the current segment `count` times.
 *  - 'range':   play the range start→end, then start again; `count` passes.
 *  - 'each':    repeat each segment `count` times before moving to the next.
 *
 * Returns the next cursor (and whether a pause should come first), or null
 * when practice is complete. The pause happens between repetitions only,
 * never between consecutive segments of the same pass.
 */
export function nextCursor(
  cfg: Pick<PracticeConfig, 'mode' | 'range' | 'count'>,
  cur: Cursor,
): CursorStep | null {
  const [first, last] = cfg.range;
  const total = cfg.count === REPEAT_FOREVER ? Infinity : cfg.count;

  if (cfg.mode === 'segment') {
    return cur.rep + 1 < total ? { cursor: { seg: cur.seg, rep: cur.rep + 1 }, gap: true } : null;
  }

  if (cfg.mode === 'range') {
    if (cur.seg < last) return { cursor: { seg: cur.seg + 1, rep: cur.rep }, gap: false };
    return cur.rep + 1 < total ? { cursor: { seg: first, rep: cur.rep + 1 }, gap: true } : null;
  }

  // 'each'
  if (cur.rep + 1 < total) return { cursor: { seg: cur.seg, rep: cur.rep + 1 }, gap: true };
  if (cur.seg < last) return { cursor: { seg: cur.seg + 1, rep: 0 }, gap: false };
  return null;
}
