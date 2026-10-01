import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { PracticeEngine, EngineSnapshot } from '../../application';
import { rangeOfGroup, rangeOfSection } from '../../domain';
import type { ContentStructure, PauseSetting, RepeatMode, TimedSegment } from '../../domain';
import { useApp } from '../AppState';
import { Segmented, Stepper, SwitchRow } from '../components/Controls';
import type { Choice } from '../components/Controls';
import { Sheet } from '../components/Sheet';
import { rangeLabel } from '../format';
import type { SheetSection } from './Dock';

const MODES: Choice<RepeatMode>[] = [{ value: 'segment', label: 'Segment' }, { value: 'range', label: 'Range' }, { value: 'each', label: 'Each segment' }];
const MODE_CAPTION: Record<RepeatMode, string> = {
  segment: 'Repeats the current segment.',
  range: 'Plays the whole range, then starts over.',
  each: 'Repeats each segment before moving to the next.',
};
const RATES: Choice<number>[] = [0.5, 0.75, 1, 1.25, 1.5].map((v) => ({ value: v, label: `${v}×` }));
const PAUSES: Choice<PauseSetting>[] = [
  { value: 0, label: 'None' }, { value: 1, label: '1 s' }, { value: 2, label: '2 s' }, { value: 3, label: '3 s' }, { value: 5, label: '5 s' }, { value: 'auto', label: 'Recite' },
];

function Group({ id, title, children }: { id: SheetSection | 'display'; title: string; children: ReactNode }) {
  return (
    <section className="sgroup" data-k={id}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

/** Range, repeat, speed, pause and display settings for the current text. Changes apply immediately. */
export function PracticeSheet({ engine, snapshot, structure, focus, onClose, onSelectOnText }: {
  engine: PracticeEngine;
  snapshot: EngineSnapshot;
  structure: ContentStructure<TimedSegment>;
  focus: SheetSection | null;
  onClose: () => void;
  onSelectOnText: () => void;
}) {
  const { settings, updateSettings } = useApp();
  const { config, seg } = snapshot;
  const [first, last] = config.range;
  const forever = config.count === 0;
  const lastCount = useRef(config.count || settings.practiceDefaults.count || 3);
  if (config.count > 0) lastCount.current = config.count;
  const body = useRef<HTMLDivElement>(null);
  const current = structure.segments[seg]!;
  const verseIsHelpful = current.groupIndex >= 0 && current.groupSize > 1;

  useEffect(() => {
    if (focus) body.current?.querySelector<HTMLElement>(`[data-k="${focus}"]`)?.scrollIntoView?.({ block: 'start' });
  }, [focus]);

  const setMode = (mode: RepeatMode): void => {
    // "each" needs a finite count, or it would never move on
    engine.configure(mode === 'each' && forever ? { mode, count: lastCount.current } : { mode });
  };

  return (
    <Sheet title="Practice settings" onClose={onClose}>
      <div ref={body}>
        <Group id="range" title="Range">
          <div className="rangesum">
            Practicing {rangeLabel(structure.segments, first, last)}, {last - first + 1} segment{last === first ? '' : 's'}
          </div>
          <div className="presets">
            <button type="button" className="btn sm" onClick={() => engine.setRange(seg, seg)}>This segment</button>
            {verseIsHelpful && (
              <button type="button" className="btn sm" onClick={() => { const r = rangeOfGroup(structure, seg); engine.setRange(r[0], r[1]); }}>This verse</button>
            )}
            <button type="button" className="btn sm" onClick={() => { const r = rangeOfSection(structure, seg); engine.setRange(r[0], r[1]); }}>Whole section</button>
            <button type="button" className="btn sm primary" onClick={() => { onClose(); onSelectOnText(); }}>Select on text</button>
          </div>
        </Group>

        <Group id="repeat" title="Repeat">
          <Segmented<RepeatMode> label="Repeat mode" choices={MODES} value={config.mode} onChange={setMode} />
          <p className="cap">{MODE_CAPTION[config.mode]}</p>
          <div className="field-row">
            <span className="lbl" style={{ fontWeight: 600 }}>Times</span>
            <Stepper value={config.count} forever={forever} decreaseLabel="Fewer repeats" increaseLabel="More repeats" onChange={(count) => engine.configure({ count })} />
          </div>
          <SwitchRow
            label="Repeat forever"
            hint={config.mode === 'each' ? 'Not available when repeating each segment.' : 'Keeps going until you pause.'}
            checked={forever}
            disabled={config.mode === 'each'}
            onChange={(on) => engine.configure({ count: on ? 0 : lastCount.current })}
          />
        </Group>

        <Group id="speed" title="Speed">
          <Segmented<number> label="Playback speed" choices={RATES} value={config.rate} onChange={(rate) => engine.configure({ rate })} />
        </Group>

        <Group id="pause" title="Pause between repetitions">
          <Segmented<PauseSetting> label="Pause between repetitions" choices={PAUSES} value={config.pause} onChange={(pause) => engine.configure({ pause })} />
          <p className="cap">Recite waits as long as the segment lasts, so you can say it from memory.</p>
        </Group>

        <Group id="display" title="Display">
          <SwitchRow label="Show translation" hint="Under each segment, when available." checked={settings.showTranslation}
            onChange={(showTranslation) => void updateSettings({ showTranslation })} />
        </Group>
      </div>
    </Sheet>
  );
}
