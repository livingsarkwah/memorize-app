export interface RingArc {
  /** SVG path data for one arc. */
  d: string;
  kind: 'base' | 'range' | 'current';
}

/**
 * The "segment ring": one arc per segment (grouped into at most 36 arcs for long texts),
 * with the practice range and the current segment highlighted. Pure geometry.
 */
export function ringArcs(segmentCount: number, highlight?: { range?: readonly [number, number]; current?: number }): RingArc[] {
  const n = Math.max(1, segmentCount);
  const bins = Math.max(2, Math.min(n, 36));
  const step = 360 / bins;
  const gap = Math.min(10, step * 0.3);
  const radius = 40;
  const point = (deg: number): [number, number] => [50 + radius * Math.cos((deg * Math.PI) / 180), 50 + radius * Math.sin((deg * Math.PI) / 180)];
  const bin = (i: number): number => Math.min(bins - 1, Math.floor((i / n) * bins));
  const range = highlight?.range ? ([bin(highlight.range[0]), bin(highlight.range[1])] as const) : null;
  const current = highlight?.current !== undefined ? bin(highlight.current) : -1;

  const arcs: RingArc[] = [];
  for (let i = 0; i < bins; i++) {
    const a0 = -90 + i * step + gap / 2;
    const a1 = -90 + (i + 1) * step - gap / 2;
    const [x0, y0] = point(a0);
    const [x1, y1] = point(a1);
    const large = a1 - a0 > 180 ? 1 : 0;
    arcs.push({
      d: `M${x0.toFixed(2)} ${y0.toFixed(2)}A${radius} ${radius} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`,
      kind: i === current ? 'current' : range && i >= range[0] && i <= range[1] ? 'range' : 'base',
    });
  }
  return arcs;
}
