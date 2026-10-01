import type { CatalogIndex, RemoteCatalogEntry } from '../../application';
import { parseCatalogEntry } from './catalogEntries';
import { DownloadError } from './PackageDownloader';

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** The catalog as a static `catalog.json` published next to the app (written by the content pipeline). */
export class JsonCatalogIndex implements CatalogIndex {
  constructor(
    private readonly catalogUrl: string,
    private readonly fetchFn: FetchLike = (url, init) => globalThis.fetch(url, init),
    /** What relative package URLs are relative to. Defaults to the page. */
    private readonly baseUrl: string = globalThis.location?.href ?? 'http://localhost/',
  ) {}

  async load(): Promise<RemoteCatalogEntry[]> {
    const catalogAbsolute = new URL(this.catalogUrl, this.baseUrl).href;
    let response: Response;
    try {
      // Always ask the server: a stale catalog would hide new texts.
      response = await this.fetchFn(catalogAbsolute, { cache: 'no-cache' });
    } catch {
      throw new DownloadError('Can’t reach the catalog right now.');
    }
    if (!response.ok) throw new DownloadError(`The catalog isn’t available (${response.status}).`);

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new DownloadError('The catalog couldn’t be read.');
    }
    const doc = json as { schemaVersion?: unknown; items?: unknown };
    if (doc?.schemaVersion !== 1 || !Array.isArray(doc.items)) throw new DownloadError('The catalog is in a format this version of the app doesn’t understand. Reload the app to update it.');

    const resolve = (url: string): string => new URL(url, catalogAbsolute).href;
    return doc.items.map((item) => parseCatalogEntry(item, resolve)).filter((e): e is RemoteCatalogEntry => e !== null);
  }
}
