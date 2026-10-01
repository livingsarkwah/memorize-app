import { describe, expect, it } from 'vitest';
import { catalogItemFrom, isNewlyPublished, isUpdateAvailable, pickContinueEntry, searchLibrary, sortLibrary } from '../../src/domain';
import type { CatalogItem, LibraryEntry, PracticeState } from '../../src/domain';

const item = (id: string, title: string, addedAt: number, extra: Partial<CatalogItem> = {}): CatalogItem => ({
  id, version: 1, title, titleNative: '', language: 'en', contentType: 'poem', author: 'A', addedAt,
  source: 'imported', segmentCount: 2, duration: 10, ...extra,
});
const practice = (itemId: string, lastPlayedAt?: number): PracticeState => ({
  itemId, lastSegmentId: 'a', rangeStartId: 'a', rangeEndId: 'a', mode: 'range', count: 3, pause: 2, rate: 1, lastPlayedAt,
});
const entries: LibraryEntry[] = [
  { item: item('a', 'Banana', 100), practice: practice('a', 500) },
  { item: item('b', 'apple', 300) },
  { item: item('c', 'Cherry', 200), practice: practice('c', 900) },
  { item: item('d', 'Date', 250), practice: practice('d') }, // opened but never played
];

describe('sortLibrary', () => {
  it('recent: last practiced first, then newest additions', () => {
    expect(sortLibrary(entries, 'recent').map((e) => e.item.id)).toEqual(['c', 'a', 'b', 'd']);
  });
  it('added: newest first', () => expect(sortLibrary(entries, 'added').map((e) => e.item.id)).toEqual(['b', 'd', 'c', 'a']));
  it('alpha: case-insensitive by title', () => expect(sortLibrary(entries, 'alpha').map((e) => e.item.title)).toEqual(['apple', 'Banana', 'Cherry', 'Date']));
  it('does not modify the list it is given', () => {
    const copy = [...entries];
    sortLibrary(entries, 'alpha');
    expect(entries).toEqual(copy);
  });
});

describe('searchLibrary', () => {
  const lib: LibraryEntry[] = [
    { item: item('1', 'Tuhfatul Atfaal', 1, { titleNative: 'تُحْفَةُ', language: 'ar', author: 'al-Jamzuri' }) },
    { item: item('2', 'At the Café', 2, { language: 'es', contentType: 'dialogue', author: 'Sample' }) },
  ];
  it('matches title, native title, author, type and language', () => {
    expect(searchLibrary(lib, 'tuhfa').map((e) => e.item.id)).toEqual(['1']);
    expect(searchLibrary(lib, 'تُحْفَةُ').map((e) => e.item.id)).toEqual(['1']);
    expect(searchLibrary(lib, 'JAMZURI').map((e) => e.item.id)).toEqual(['1']);
    expect(searchLibrary(lib, 'dialogue').map((e) => e.item.id)).toEqual(['2']);
    expect(searchLibrary(lib, 'es').map((e) => e.item.id)).toContain('2');
  });
  it('returns everything for an empty query and nothing for no match', () => {
    expect(searchLibrary(lib, '  ')).toHaveLength(2);
    expect(searchLibrary(lib, 'zzz')).toEqual([]);
  });
});

describe('pickContinueEntry', () => {
  it('is the most recently practiced text', () => expect(pickContinueEntry(entries)?.item.id).toBe('c'));
  it('is undefined when nothing has been played', () => expect(pickContinueEntry([entries[1]!, entries[3]!])).toBeUndefined());
});

describe('catalogItemFrom', () => {
  it('fills in defaults for optional manifest fields', () => {
    const it = catalogItemFrom({ schemaVersion: 1, contentId: 'x', version: 2, title: 'X', language: 'en' }, { addedAt: 5, source: 'imported', segmentCount: 3, duration: 0 });
    expect(it).toMatchObject({ id: 'x', version: 2, titleNative: '', contentType: 'text', author: 'Unknown author', addedAt: 5 });
  });
});

describe('isUpdateAvailable', () => {
  const installed = (over: Partial<CatalogItem> = {}) => ({ source: 'official' as const, version: 1 as number | string, packageHash: 'aaa', ...over });

  it('is true when the published hash differs from the installed one, even at the same version', () => {
    expect(isUpdateAvailable(installed(), { version: 1, sha256: 'bbb' })).toBe(true);
    expect(isUpdateAvailable(installed(), { version: 1, sha256: 'aaa' })).toBe(false);
  });

  it('offers the update once to texts installed before hashes existed (for example the old melody samples)', () => {
    expect(isUpdateAvailable(installed({ packageHash: undefined }), { version: 1, sha256: 'bbb' })).toBe(true);
  });

  it('falls back to comparing version numbers when there is no hash', () => {
    expect(isUpdateAvailable(installed(), { version: 2 })).toBe(true);
    expect(isUpdateAvailable(installed({ version: 3 }), { version: 2 })).toBe(false);
    expect(isUpdateAvailable(installed({ version: '2' }), { version: 10 })).toBe(true);
    expect(isUpdateAvailable(installed({ version: 'a' }), { version: 'b' })).toBe(true);
    expect(isUpdateAvailable(installed({ version: 'a' }), { version: 'a' })).toBe(false);
  });

  it('never applies to texts the person imported themselves', () => {
    expect(isUpdateAvailable(installed({ source: 'imported' }), { version: 9, sha256: 'zzz' })).toBe(false);
  });
});

describe('isNewlyPublished', () => {
  const now = Date.parse('2026-10-01T12:00:00Z');
  it('is true for the last three weeks, false after, and false for the future', () => {
    expect(isNewlyPublished('2026-09-28', now)).toBe(true);
    expect(isNewlyPublished('2026-09-10', now)).toBe(true);
    expect(isNewlyPublished('2026-09-09', now)).toBe(false);
    expect(isNewlyPublished('2026-10-05', now)).toBe(false);
  });
  it('is never true when the date is unknown or unreadable', () => {
    expect(isNewlyPublished(undefined, now)).toBe(false);
    expect(isNewlyPublished('', now)).toBe(false);
    expect(isNewlyPublished('last week', now)).toBe(false);
  });
  it('respects a custom window', () => expect(isNewlyPublished('2026-09-28', now, 1)).toBe(false));
});

describe('catalogItemFrom with the new optional fields', () => {
  it('carries the reciter and the package hash', () => {
    const item = catalogItemFrom(
      { schemaVersion: 1, contentId: 'x', version: 1, title: 'X', language: 'ar', reciter: 'Sheikh A' },
      { addedAt: 1, source: 'official', segmentCount: 2, duration: 3, packageHash: 'abc' },
    );
    expect(item).toMatchObject({ reciter: 'Sheikh A', packageHash: 'abc', source: 'official' });
  });
  it('leaves them out when absent', () => {
    const item = catalogItemFrom({ schemaVersion: 1, contentId: 'x', version: 1, title: 'X', language: 'ar' }, { addedAt: 1, source: 'imported', segmentCount: 2, duration: 3 });
    expect('reciter' in item).toBe(false);
    expect('packageHash' in item).toBe(false);
  });
});
