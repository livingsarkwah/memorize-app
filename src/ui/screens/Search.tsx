import { useState } from 'react';
import { searchLibrary } from '../../domain';
import { ItemRow } from '../components/ItemRow';
import { RequestContentLink } from '../components/RequestContentLink';
import { capitalize } from '../format';
import { useShelf } from './Library';

export function SearchScreen() {
  const shelf = useShelf();
  const [query, setQuery] = useState('');
  const q = query.trim();
  const types = [...new Set(shelf.map((e) => e.item.contentType))];
  const hits = searchLibrary(shelf, q);

  return (
    <div className="page">
      <h1 className="h1">Search</h1>
      <div style={{ marginTop: 16 }}>
        <input
          type="search" className="field" placeholder="Title, author, or type" autoComplete="off" spellCheck={false}
          aria-label="Search the library" value={query} onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {!q ? (
        <>
          <div className="presets">
            {types.map((t) => <button key={t} type="button" className="btn sm" onClick={() => setQuery(t)}>{capitalize(t)}</button>)}
          </div>
          <p className="note">Search by title, author, or type, or pick a type above.</p>
        </>
      ) : (
        <div className="list">
          {hits.length === 0 ? (
            <div className="empty">
              <p className="note" style={{ margin: '0 0 14px' }}>Nothing matches “{q}”. Try a title, an author, or a type such as poem.</p>
              <RequestContentLink prefill={q} />
            </div>
          ) : (
            hits.map((e) => (
              <ItemRow key={e.item.id} item={e.item} entry={e.installed ? e : undefined} installed={e.installed} updateAvailable={e.updateAvailable} publishedAt={e.publishedAt} />
            ))
          )}
        </div>
      )}
    </div>
  );
}
