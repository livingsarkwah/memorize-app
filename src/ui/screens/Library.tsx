import { useRef, useState } from 'react';
import { useApp } from '../AppState';
import { sortLibrary } from '../../domain';
import type { LibraryEntry, LibrarySort } from '../../domain';
import { Icon } from '../components/Icon';
import { Segmented } from '../components/Controls';
import { ItemRow } from '../components/ItemRow';
import { RequestContentLink } from '../components/RequestContentLink';
import { availableAsItem } from '../format';

export type ShelfEntry = LibraryEntry & { installed: boolean; updateAvailable?: boolean; publishedAt?: string };

/** Installed texts (flagged if a newer version is out), then the ones not installed yet, as one list. */
export function useShelf(): ShelfEntry[] {
  const { installed, available, updates } = useApp();
  const updateIds = new Set(updates.map((u) => u.id));
  const publishedById = new Map([...available, ...updates].map((a) => [a.id, a.publishedAt]));
  return [
    ...installed.map((e) => ({ ...e, installed: true, updateAvailable: updateIds.has(e.item.id), publishedAt: publishedById.get(e.item.id) })),
    ...available.map((a) => ({ item: availableAsItem(a), installed: false, publishedAt: a.publishedAt })),
  ];
}

export function LibraryScreen() {
  const { importFile } = useApp();
  const shelf = useShelf();
  const [sort, setSort] = useState<LibrarySort>('recent');
  const file = useRef<HTMLInputElement>(null);

  return (
    <div className="page">
      <h1 className="h1">Library</h1>
      <p className="sub">Download a text once and practice it offline.</p>
      <div style={{ marginTop: 16 }}>
        <Segmented<LibrarySort>
          label="Sort library" value={sort} onChange={setSort}
          choices={[{ value: 'recent', label: 'Recent' }, { value: 'added', label: 'Newest' }, { value: 'alpha', label: 'A to Z' }]}
        />
      </div>
      <div className="list">
        {sortLibrary(shelf, sort).map((e) => (
          <ItemRow
            key={e.item.id} item={e.item} entry={e.installed ? e : undefined} installed={e.installed} showRemove
            updateAvailable={e.updateAvailable} publishedAt={e.publishedAt}
          />
        ))}
      </div>
      <div className="row" style={{ marginTop: 22 }}>
        <button type="button" className="btn" onClick={() => file.current?.click()}><Icon name="import" size={18} />Import a package (.zip)</button>
        <input
          ref={file} type="file" accept=".zip,application/zip" hidden
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importFile(f); }}
        />
        <RequestContentLink />
      </div>
    </div>
  );
}
