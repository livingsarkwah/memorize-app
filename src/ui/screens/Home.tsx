import { useApp } from '../AppState';
import { pickContinueEntry, sortLibrary } from '../../domain';
import { Cover, Logo } from '../components/Cover';
import { Icon } from '../components/Icon';
import { ItemRow } from '../components/ItemRow';
import { Titles } from '../components/Titles';
import { directionOf, practiceSummary, rangeLabel, timeAgo } from '../format';
import { navigate } from '../router';
import { useShelf } from './Library';

export function HomeScreen() {
  const { installed, loaded } = useApp();
  const shelf = useShelf();
  const practiced = sortLibrary(installed.filter((e) => e.practice?.lastPlayedAt), 'recent');
  const lead = pickContinueEntry(practiced);
  const rest = practiced.filter((e) => e !== lead);
  const updates = shelf.filter((e) => e.updateAvailable);
  const toDownload = shelf.filter((e) => !e.installed);

  return (
    <div className="page">
      <div className="top">
        <Logo />
        <span className="wm">Memorize</span>
      </div>
      {loaded && (lead ? <ContinueCard entry={lead} /> : <EmptyState />)}
      {updates.length > 0 && (
        <>
          <h2 className="h2">Updates available</h2>
          <div className="list">
            {updates.map((e) => (
              <ItemRow key={e.item.id} item={e.item} entry={e} installed updateAvailable subtitle="A newer version is ready" />
            ))}
          </div>
        </>
      )}
      {rest.length > 0 && (
        <>
          <h2 className="h2">Recently practiced</h2>
          <div className="list">
            {rest.slice(0, 4).map((e) => (
              <ItemRow key={e.item.id} item={e.item} entry={e} installed compact subtitle={`Practiced ${timeAgo(e.practice!.lastPlayedAt!)}`} />
            ))}
          </div>
        </>
      )}
      {toDownload.length > 0 && (
        <>
          <h2 className="h2">Available to download</h2>
          <div className="list">
            {toDownload.slice(0, 3).map((e) => (
              <ItemRow key={e.item.id} item={e.item} installed={false} publishedAt={e.publishedAt} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ContinueCard({ entry }: { entry: NonNullable<ReturnType<typeof pickContinueEntry>> }) {
  const { structures } = useApp();
  const { item, practice } = entry;
  const structure = structures.get(item.id);
  const segments = structure?.segments ?? [];
  const index = (id: string): number => segments.findIndex((s) => s.id === id);
  let first = index(practice!.rangeStartId);
  let last = index(practice!.rangeEndId);
  if (first < 0 || last < 0) { first = 0; last = 0; }
  const current = Math.max(0, index(practice!.lastSegmentId));
  const segment = segments[current];
  const label = rangeLabel(segments, first, last);

  return (
    <>
      <h1 className="h1">Continue practice</h1>
      <section className="hero" aria-label={`Continue ${item.title}`}>
        <div className="hero-top">
          <Cover id={item.id} segmentCount={item.segmentCount} size="lg" range={[first, last]} current={current} />
          <div><Titles title={item.title} titleNative={item.titleNative} language={item.language} englishClass="t1" nativeClass="t2" /></div>
        </div>
        {segment && (
          <div className="hero-text"><p lang={item.language} dir={directionOf(item.language)}>{segment.text}</p></div>
        )}
        <p className="hero-meta">
          {practiceSummary(practice!, label, first === last, !!segments[first]?.isHeading)}. Last practiced {timeAgo(practice!.lastPlayedAt!)}.
        </p>
        <button type="button" className="btn primary wide" onClick={() => navigate({ name: 'player', id: item.id })}>
          <Icon name="play" size={20} />Continue
        </button>
      </section>
    </>
  );
}

function EmptyState() {
  const { installed } = useApp();
  const first = sortLibrary(installed, 'added')[0];
  return (
    <>
      <h1 className="h1">Start with a text</h1>
      <div className="empty">
        <h2 className="h2" style={{ margin: 0 }}>Practice a few segments at a time</h2>
        <p>Download a text, choose the part you’re working on, and repeat it at your own pace. Your place is saved on this device.</p>
        <button type="button" className="btn primary" onClick={() => navigate(first ? { name: 'player', id: first.item.id } : { name: 'library' })}>
          {first ? `Open ${first.item.title}` : 'Browse the library'}
        </button>
      </div>
    </>
  );
}
