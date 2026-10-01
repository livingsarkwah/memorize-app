import { useCallback, useState } from 'react';
import type { PointerEvent } from 'react';
import type { AppServices } from '../../app/container';
import { useApp } from '../AppState';
import { Icon } from '../components/Icon';
import { Titles } from '../components/Titles';
import { navigate } from '../router';
import type { Route } from '../router';
import { usePracticeSession } from '../usePracticeSession';
import { Dock } from './Dock';
import type { SheetSection } from './Dock';
import { useMediaSession, usePlayerShortcuts } from './hooks';
import { PracticeSheet } from './PracticeSheet';
import { Transcript } from './Transcript';

type Sheet = { open: false } | { open: true; focus: SheetSection | null };
type Selection = { first: number | null } | null;

export function PlayerScreen({ services, itemId, backTo }: { services: AppServices; itemId: string; backTo: Route }) {
  const { settings, refresh, showToast } = useApp();
  const back = useCallback(() => navigate(backTo), [backTo]);
  const { opened, engine, snapshot, error } = usePracticeSession(services, itemId, {
    onProgressSaved: () => void refresh(),
    onBlocked: () => showToast('Playback couldn’t start. Tap play to try again.'),
  });
  const [sheet, setSheet] = useState<Sheet>({ open: false });
  const [selection, setSelection] = useState<Selection>(null);

  const playing = snapshot?.status === 'playing' || snapshot?.status === 'gap';
  usePlayerShortcuts(engine);
  useMediaSession(engine, opened?.item.title ?? '', opened?.item.author ?? 'Memorize', playing);

  if (error && !opened) {
    return (
      <div className="player">
        <div className="loading">
          <h1 className="h1" style={{ marginBottom: 8 }}>This item can’t be opened</h1>
          <p role="alert">{error}</p>
          <div style={{ marginTop: 18 }}><button type="button" className="btn primary" onClick={back}>Back</button></div>
        </div>
      </div>
    );
  }
  if (!opened || !engine || !snapshot) return <div className="player"><div className="loading" role="status">Preparing audio…</div></div>;

  const { item, structure } = opened;
  const segments = structure.segments;
  const { config, seg } = snapshot;
  const [first, last] = config.range;
  const section = structure.sections[segments[seg]!.sectionIndex]!;
  const sectionLine = structure.sections.length > 1 ? section.title || section.titleNative : '';

  /** Tapping text: jump there (and play), or - while choosing a range - set its start, then its end. */
  const activate = (index: number, play: boolean): void => {
    if (selection) {
      if (selection.first === null) setSelection({ first: index });
      else { const start = selection.first; setSelection(null); engine.setRange(start, index); }
      return;
    }
    engine.select(index);
    if (play) engine.play();
  };

  const onStrip = (e: PointerEvent<HTMLDivElement>): void => {
    const box = e.currentTarget.getBoundingClientRect();
    const pad = 18;
    const f = Math.min(0.9999, Math.max(0, (e.clientX - box.left - pad) / Math.max(1, box.width - pad * 2)));
    activate(Math.floor(f * segments.length), false);
  };

  const banner = selection?.first == null ? 'Tap the first segment of your range.' : `Start is ${segments[selection.first]!.label}. Now tap the last segment.`;

  return (
    <div className={`player${settings.showTranslation ? ' show-tr' : ''}`}>
      <header className="p-head">
        <button type="button" className="iconbtn" aria-label="Back" onClick={back}><Icon name="back" /></button>
        <div className="p-title">
          <Titles title={item.title} titleNative={item.titleNative} language={item.language} englishClass="t-en" nativeClass="t-native" />
          <div className="sec">{sectionLine}</div>
        </div>
        <button type="button" className="iconbtn" aria-label="Practice settings" onClick={() => setSheet({ open: true, focus: null })}><Icon name="settings" /></button>
      </header>

      <div className="strip" aria-hidden="true" onPointerDown={onStrip}>
        {segments.map((s) => (
          <i key={s.id} className={s.index === seg ? 'cur' : s.index >= first && s.index <= last ? 'in-range' : undefined} />
        ))}
      </div>

      <Transcript
        structure={structure} language={item.language} current={seg} range={config.range}
        selecting={selection !== null} firstPick={selection?.first ?? null} banner={banner}
        onActivate={(i) => activate(i, true)} onCancelSelect={() => setSelection(null)}
      />

      <Dock
        snapshot={snapshot} segments={segments}
        onOpenSheet={(focus) => setSheet({ open: true, focus })}
        onToggle={() => engine.toggle()} onPrev={() => engine.prev()} onNext={() => engine.next()}
      />

      {sheet.open && (
        <PracticeSheet
          engine={engine} snapshot={snapshot} structure={structure} focus={sheet.focus}
          onClose={() => setSheet({ open: false })} onSelectOnText={() => setSelection({ first: null })}
        />
      )}
    </div>
  );
}
