import { memo, useEffect, useRef } from 'react';
import type { ReactElement } from 'react';
import type { KeyboardEvent } from 'react';
import type { ContentStructure, TimedSegment } from '../../domain';
import { Titles } from '../components/Titles';
import { directionOf } from '../format';
import { prefersReducedMotion } from './hooks';

interface RowProps {
  segment: TimedSegment;
  language: string;
  current: boolean;
  inRange: boolean;
  firstPick: boolean;
  onActivate: (index: number) => void;
}

/** One playable segment: a label pill on the range rail, the text, and an optional translation. */
const Row = memo(function Row({ segment: s, language, current, inRange, firstPick, onActivate }: RowProps) {
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onActivate(s.index); }
  };
  const cls = ['tr-row', s.isHeading && 'is-heading', inRange && 'in-range', current && 'cur', firstPick && 'first-pick'].filter(Boolean).join(' ');
  return (
    <div className={cls} role="button" tabIndex={0} data-i={s.index} aria-current={current || undefined} onClick={() => onActivate(s.index)} onKeyDown={onKey}>
      <span className="tick" aria-hidden="true">{s.label}</span>
      <div className="body">
        {s.speaker && <div className="spk">{s.speaker}</div>}
        <p className="txt" lang={language} dir={directionOf(language)}>
          <span className="sr">{s.isHeading ? 'Title. ' : `Segment ${s.label}. `}</span>
          {s.text}
        </p>
        {s.translation && <p className="tr" lang="en">{s.translation}</p>}
      </div>
    </div>
  );
});

/** The scrolling text. Keeps the current segment in view as playback moves. */
export function Transcript({ structure, language, current, range, selecting, firstPick, banner, onActivate, onCancelSelect }: {
  structure: ContentStructure<TimedSegment>;
  language: string;
  current: number;
  range: readonly [number, number];
  selecting: boolean;
  firstPick: number | null;
  banner: string;
  onActivate: (index: number) => void;
  onCancelSelect: () => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);

  // Bring the current segment to the middle whenever it changes (not while choosing a range).
  useEffect(() => {
    const box = scroller.current;
    const row = box?.querySelector<HTMLElement>(`[data-i="${current}"]`);
    if (!box || !row || selecting) { mounted.current = true; return; }
    const top = row.offsetTop - (box.clientHeight - row.offsetHeight) / 2;
    box.scrollTo?.({ top: Math.max(0, top), behavior: mounted.current && !prefersReducedMotion() ? 'smooth' : 'auto' });
    mounted.current = true;
  }, [current, selecting]);

  useEffect(() => { if (selecting) scroller.current?.scrollTo?.({ top: 0 }); }, [selecting]);

  const row = (i: number) => {
    const s = structure.segments[i]!;
    return (
      <Row key={s.id} segment={s} language={language} current={i === current} inRange={i >= range[0] && i <= range[1]} firstPick={i === firstPick} onActivate={onActivate} />
    );
  };

  return (
    <div ref={scroller} className={`transcript${selecting ? ' selecting' : ''}`}>
      {selecting && (
        <div className="selbar" role="status">
          <span>{banner}</span>
          <button type="button" className="btn sm" onClick={onCancelSelect}>Cancel</button>
        </div>
      )}
      {structure.sections.map((sec, si) => {
        const blocks: ReactElement[] = [];
        for (let i = sec.first; i <= sec.last; ) {
          const s = structure.segments[i]!;
          if (s.isHeading) { blocks.push(<div className="flow" key={s.id}>{row(i)}</div>); i++; continue; }
          if (s.groupIndex >= 0) {
            const g = structure.groups[s.groupIndex]!;
            const rows: ReactElement[] = [];
            for (let k = g.first; k <= g.last; k++) rows.push(row(k));
            blocks.push(<div className="verse" role="group" aria-label={g.label || 'Group'} key={g.id}>{rows}</div>);
            i = g.last + 1;
          } else {
            const rows: ReactElement[] = [];
            const start = i;
            while (i <= sec.last && structure.segments[i]!.groupIndex < 0 && !structure.segments[i]!.isHeading) rows.push(row(i++));
            blocks.push(<div className="flow" key={`f${start}`}>{rows}</div>);
          }
        }
        const showHead = structure.sections.length > 1 || sec.title || sec.titleNative;
        return (
          <section key={sec.id ?? si} aria-label={sec.title || `Section ${si + 1}`}>
            {showHead && (
              <div className="tsec-head">
                <Titles title={sec.title} titleNative={sec.titleNative} language={language} englishClass="t-en" nativeClass="t-native" />
              </div>
            )}
            {blocks}
          </section>
        );
      })}
    </div>
  );
}
