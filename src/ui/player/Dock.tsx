import type { EngineSnapshot } from '../../application';
import type { TimedSegment } from '../../domain';
import { Icon } from '../components/Icon';
import type { IconName } from '../components/Icon';
import { rangeLabel } from '../format';

export type SheetSection = 'range' | 'repeat' | 'speed' | 'pause';

const MODE_LABEL = { segment: 'Segment', range: 'Range', each: 'Each' } as const;

function Chip({ icon, text, hidden, onClick }: { icon: IconName; text: string; hidden: string; onClick: () => void }) {
  return (
    <button type="button" className="chip" onClick={onClick}>
      <Icon name={icon} size={18} />
      <span>{text}</span>
      <span className="sr">{hidden}</span>
    </button>
  );
}

/** What the status line says right now ("Playing 2A", "Your turn", ...). */
export function statusText(snapshot: EngineSnapshot, segments: readonly TimedSegment[]): { left: string; strong: string; right: string } {
  const at = segments[snapshot.seg]!;
  const where = at.isHeading ? 'the title' : at.label;
  const { config, status } = snapshot;
  const unit = config.mode === 'range' ? 'Pass' : 'Repeat';
  const right = status === 'idle' ? '' : config.count === 0 ? `${unit} ${snapshot.rep + 1}` : `${unit} ${Math.min(snapshot.rep + 1, config.count)} of ${config.count}`;
  switch (status) {
    case 'playing': return { left: 'Playing ', strong: where, right };
    case 'gap': return { left: '', strong: 'Your turn', right };
    case 'finished': return { left: '', strong: 'Finished', right: '' };
    case 'paused': return { left: 'Paused at ', strong: where, right };
    default: return { left: 'Ready at ', strong: where, right };
  }
}

/** The bottom dock: status, the pause countdown, the four setting chips, and transport controls. */
export function Dock({ snapshot, segments, onOpenSheet, onToggle, onPrev, onNext }: {
  snapshot: EngineSnapshot;
  segments: readonly TimedSegment[];
  onOpenSheet: (section: SheetSection) => void;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const { config, status } = snapshot;
  const playing = status === 'playing' || status === 'gap';
  const text = statusText(snapshot, segments);
  const repeat = `${MODE_LABEL[config.mode]} ${config.count === 0 ? '×∞' : `×${config.count}`}`;
  const pause = config.pause === 'auto' ? 'Recite gap' : config.pause === 0 ? 'No gap' : `${config.pause} s gap`;

  return (
    <div className="dock">
      <div className="status">
        <span>{text.left}<b>{text.strong}</b>{status === 'finished' && ' — press play to go again'}</span>
        <span>{text.right}</span>
      </div>
      <div className={`gapbar${status === 'gap' ? ' on' : ''}`} aria-hidden="true" style={{ ['--gap' as string]: `${snapshot.gapMs}ms` }}>
        {/* a new key restarts the countdown animation for every pause */}
        <i key={`${snapshot.seg}-${snapshot.rep}-${status === 'gap'}`} />
      </div>
      <div className="chips">
        <Chip icon="range" text={rangeLabel(segments, config.range[0], config.range[1])} hidden="Practice range" onClick={() => onOpenSheet('range')} />
        <Chip icon="repeat" text={repeat} hidden="Repeat mode" onClick={() => onOpenSheet('repeat')} />
        <Chip icon="gauge" text={`${config.rate}×`} hidden="Speed" onClick={() => onOpenSheet('speed')} />
        <Chip icon="timer" text={pause} hidden="Pause between repetitions" onClick={() => onOpenSheet('pause')} />
      </div>
      <div className="transport">
        <button type="button" className="tbtn" aria-label="Previous segment" onClick={onPrev}><Icon name="prev" size={26} /></button>
        <button type="button" className="tbtn playbtn" aria-label={playing ? 'Pause' : 'Play'} onClick={onToggle}><Icon name={playing ? 'pause' : 'play'} size={32} /></button>
        <button type="button" className="tbtn" aria-label="Next segment" onClick={onNext}><Icon name="next" size={26} /></button>
      </div>
    </div>
  );
}
