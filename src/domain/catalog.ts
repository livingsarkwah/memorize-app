import type { PracticeState } from './practiceState';
import type { Manifest } from './types';

/** Where a text in the local library came from: the app's own catalog, or a file the user imported. */
export type ItemSource = 'official' | 'imported';

/** Library metadata for one text. Small, so listing the library never loads audio. */
export interface CatalogItem {
  id: string;
  version: number | string;
  title: string;
  titleNative: string;
  language: string;
  contentType: string;
  author: string;
  reciter?: string;
  addedAt: number;
  source: ItemSource;
  segmentCount: number;
  /** Audio length in seconds, 0 if unknown. */
  duration: number;
  /** SHA-256 of the package this was installed from (official texts only). Detects changed content. */
  packageHash?: string;
}

export interface LibraryEntry {
  item: CatalogItem;
  practice?: PracticeState;
}

export type LibrarySort = 'recent' | 'added' | 'alpha';

export function catalogItemFrom(
  manifest: Manifest,
  extra: Pick<CatalogItem, 'addedAt' | 'source' | 'segmentCount' | 'duration'> & { packageHash?: string },
): CatalogItem {
  return {
    id: manifest.contentId,
    version: manifest.version,
    title: manifest.title,
    titleNative: manifest.titleNative ?? '',
    language: manifest.language,
    contentType: manifest.contentType ?? 'text',
    author: manifest.author ?? 'Unknown author',
    ...(manifest.reciter ? { reciter: manifest.reciter } : {}),
    ...extra,
  };
}

/**
 * Has the published version of an official text changed since it was installed?
 * The package hash is authoritative (any change to the files counts, even with the same version
 * number, and texts installed before hashes existed are offered the update once). Without a hash,
 * fall back to comparing version numbers.
 */
export function isUpdateAvailable(
  installed: Pick<CatalogItem, 'source' | 'version' | 'packageHash'>,
  published: { version: number | string; sha256?: string },
): boolean {
  if (installed.source !== 'official') return false;
  if (published.sha256) return published.sha256 !== installed.packageHash;
  const a = Number(published.version), b = Number(installed.version);
  return Number.isFinite(a) && Number.isFinite(b) ? a > b : String(published.version) !== String(installed.version);
}

export const NEW_LABEL_DAYS = 21;

/**
 * Published within the last few weeks. A bare date ("2026-09-28") means "sometime that day", so it counts
 * as new all through that day and for the whole window after it. Unknown or unreadable dates are never new.
 */
export function isNewlyPublished(publishedAt: string | undefined, now: number, days = NEW_LABEL_DAYS): boolean {
  if (!publishedAt) return false;
  const start = Date.parse(publishedAt);
  if (!Number.isFinite(start)) return false;
  const dayMs = 86_400_000;
  const end = /^\d{4}-\d{2}-\d{2}$/.test(publishedAt) ? start + dayMs : start;
  return start <= now && now - end <= days * dayMs;
}

const lastPlayed = (e: Pick<LibraryEntry, 'practice'>): number => e.practice?.lastPlayedAt ?? 0;

/** Returns a sorted copy. 'recent' = most recently practiced first, then newest additions. */
export function sortLibrary<E extends LibraryEntry>(entries: readonly E[], sort: LibrarySort): E[] {
  const list = [...entries];
  if (sort === 'alpha') return list.sort((a, b) => a.item.title.localeCompare(b.item.title));
  if (sort === 'added') return list.sort((a, b) => b.item.addedAt - a.item.addedAt);
  return list.sort((a, b) => lastPlayed(b) - lastPlayed(a) || b.item.addedAt - a.item.addedAt);
}

/** Case-insensitive search over title, native title, author, type and language code. */
export function searchLibrary<E extends LibraryEntry>(entries: readonly E[], query: string): E[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...entries];
  return entries.filter(({ item }) =>
    [item.title, item.titleNative, item.author, item.contentType, item.language].join(' ').toLowerCase().includes(q),
  );
}

/** The text to offer under "Continue practice": the most recently practiced one. */
export function pickContinueEntry<E extends LibraryEntry>(entries: readonly E[]): E | undefined {
  return entries.filter((e) => lastPlayed(e) > 0).sort((a, b) => lastPlayed(b) - lastPlayed(a))[0];
}
