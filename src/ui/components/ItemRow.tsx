import { useApp } from '../AppState';
import type { CatalogItem, LibraryEntry } from '../../domain';
import { isNewlyPublished } from '../../domain';
import { directionOf, typeLine } from '../format';
import { navigate } from '../router';
import { Cover } from './Cover';
import { Icon } from './Icon';

/** One text in a list: cover ring, titles, meta, and its action (Open / Download / Update / progress). */
export function ItemRow({ item, entry, installed, compact = false, subtitle, showRemove = false, updateAvailable = false, publishedAt }: {
  item: CatalogItem;
  entry?: LibraryEntry;
  installed: boolean;
  compact?: boolean;
  subtitle?: string;
  showRemove?: boolean;
  /** A newer version of this installed text is in the catalog. */
  updateAvailable?: boolean;
  /** ISO date this text (or its current update) was published, for the "New" label. */
  publishedAt?: string;
}) {
  const { settings, downloads, startDownload, removeItem, structures } = useApp();
  const progress = downloads[item.id];
  const structure = structures.get(item.id);
  const practice = entry?.practice;
  const isNew = !installed && isNewlyPublished(publishedAt, Date.now());

  // Highlight the saved practice range on the ring, when we know it.
  let range: [number, number] | undefined;
  if (structure && practice) {
    const a = structure.segments.findIndex((s) => s.id === practice.rangeStartId);
    const b = structure.segments.findIndex((s) => s.id === practice.rangeEndId);
    if (a >= 0 && b >= 0) range = [a, b];
  }

  const open = (): void => navigate({ name: 'player', id: item.id });
  const percent = progress ? Math.round(progress.fraction * 100) : 0;

  return (
    <article className={`irow${compact ? ' compact' : ''}`} data-id={item.id}>
      <Cover id={item.id} segmentCount={item.segmentCount} size={compact ? 'sm' : undefined} range={range} />
      <div className="txtcol">
        <div className="row" style={{ gap: 6 }}>
          {installed ? <button type="button" className="t" onClick={open}>{item.title}</button> : <div className="t">{item.title}</div>}
          {isNew && <span className="badge new">New</span>}
          {updateAvailable && <span className="badge update">Update available</span>}
        </div>
        {settings.titles !== 'english' && item.titleNative && (
          <div className="tn" lang={item.language} dir={directionOf(item.language)}>{item.titleNative}</div>
        )}
        <div className="m">{subtitle ?? (item.reciter ? `${item.author} · ${item.reciter}` : item.author)}</div>
        {!compact && <div className="m">{typeLine(item)}</div>}
        {showRemove && installed && entry && (
          <button type="button" className="linkbtn" onClick={() => void removeItem(entry)}>Remove from this device</button>
        )}
      </div>
      <div className="acts">
        {progress ? (
          <>
            <div className="dlprog" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={`Downloading ${item.title}`}>
              <i style={{ width: `${percent}%` }} />
            </div>
            <span className="dltxt">{progress.phase === 'verifying' ? 'Verifying' : `${percent}%`}</span>
          </>
        ) : updateAvailable ? (
          <button type="button" className="btn sm" onClick={() => startDownload(item.id)}><Icon name="download" size={18} />Update</button>
        ) : installed ? (
          <button type="button" className="btn primary sm" onClick={open}>Open</button>
        ) : (
          <button type="button" className="btn sm" onClick={() => startDownload(item.id)}><Icon name="download" size={18} />Download</button>
        )}
      </div>
    </article>
  );
}
