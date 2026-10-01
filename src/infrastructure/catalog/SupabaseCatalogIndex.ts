import type { CatalogIndex, RemoteCatalogEntry } from '../../application';
import { parseCatalogEntry } from './catalogEntries';
import { DownloadError } from './PackageDownloader';

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface SupabaseCatalogOptions {
  /** e.g. https://abcdefgh.supabase.co */
  url: string;
  /** The public "anon" key. Safe to ship: Row Level Security limits it to reading published rows. */
  anonKey: string;
  /** Table holding one row per text. See docs/SUPABASE.md for the schema. */
  table?: string;
  fetch?: FetchLike;
}

/**
 * The same catalog, read from a Supabase table instead of a static file. Nothing else in the app changes:
 * package files are downloaded (and verified against `package_sha256`) exactly the same way, from wherever
 * `package_url` points, typically a public Storage bucket.
 */
export class SupabaseCatalogIndex implements CatalogIndex {
  private readonly table: string;
  private readonly fetchFn: FetchLike;

  constructor(private readonly options: SupabaseCatalogOptions) {
    this.table = options.table ?? 'catalog_items';
    this.fetchFn = options.fetch ?? ((url, init) => globalThis.fetch(url, init));
  }

  async load(): Promise<RemoteCatalogEntry[]> {
    const endpoint = `${this.options.url.replace(/\/+$/, '')}/rest/v1/${this.table}?select=*&order=published_at.desc.nullslast`;
    let response: Response;
    try {
      response = await this.fetchFn(endpoint, {
        cache: 'no-cache',
        headers: { apikey: this.options.anonKey, Authorization: `Bearer ${this.options.anonKey}` },
      });
    } catch {
      throw new DownloadError('Can’t reach the catalog right now.');
    }
    if (!response.ok) throw new DownloadError(`The catalog isn’t available (${response.status}).`);

    const rows = (await response.json().catch(() => null)) as unknown;
    if (!Array.isArray(rows)) throw new DownloadError('The catalog couldn’t be read.');
    return rows.map((row) => parseCatalogEntry(rowToEntry(row), (url) => url)).filter((e): e is RemoteCatalogEntry => e !== null);
  }
}

/** Database column names (snake_case) to the catalog's field names. */
export function rowToEntry(row: unknown): unknown {
  if (typeof row !== 'object' || row === null) return null;
  const r = row as Record<string, unknown>;
  return {
    id: r.id,
    version: r.version,
    title: r.title,
    titleNative: r.title_native,
    language: r.language,
    contentType: r.content_type,
    author: r.author,
    reciter: r.reciter,
    segmentCount: r.segment_count,
    duration: r.duration,
    publishedAt: r.published_at,
    package: { url: r.package_url, sha256: r.package_sha256, sizeBytes: r.package_size_bytes },
  };
}
