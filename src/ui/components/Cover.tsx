import type { CSSProperties } from 'react';
import { hueFor } from '../format';
import { ringArcs } from '../ring';

/** The ring of arcs: one arc per segment, with the practice range and current segment highlighted. */
export function Ring({ segmentCount, range, current }: { segmentCount: number; range?: readonly [number, number]; current?: number }) {
  const arcs = ringArcs(segmentCount, { range, current });
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      {arcs.map((a, i) => (
        <path key={i} d={a.d} className={`arc${a.kind === 'range' ? ' hi' : a.kind === 'current' ? ' cur' : ''}`} />
      ))}
    </svg>
  );
}

export function Cover({ id, segmentCount, size, range, current }: {
  id: string; segmentCount: number; size?: 'sm' | 'lg'; range?: readonly [number, number]; current?: number;
}) {
  return (
    <div className={`cover${size ? ' ' + size : ''}`} style={{ '--h': hueFor(id) } as CSSProperties}>
      <Ring segmentCount={segmentCount} range={range} current={current} />
    </div>
  );
}

/** The small brand mark: eight arcs with the first two in gold. */
export function Logo() {
  return (
    <span className="logo">
      <Ring segmentCount={8} range={[0, 1]} />
    </span>
  );
}
