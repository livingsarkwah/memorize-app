import { isUpdateAvailable } from '../domain';
import type { CatalogItem } from '../domain';
import type { AvailableItem, CatalogSource, DownloadProgress } from './catalog';
import type { LibraryService } from './LibraryService';

export interface CatalogCheck {
  /** Texts in the catalog that are not installed yet. */
  available: AvailableItem[];
  /** Installed official texts whose published version has changed. Downloading one replaces it. */
  updates: AvailableItem[];
}

/** Browse what is available to download, notice updates, and install texts into the local library. */
export class DownloadService {
  constructor(
    private readonly source: CatalogSource,
    private readonly library: LibraryService,
  ) {}

  /** One look at the catalog, sorted into "new to you" and "changed since you installed it". */
  async check(): Promise<CatalogCheck> {
    const [offered, installed] = await Promise.all([this.source.list(), this.library.entries()]);
    const have = new Map(installed.map((e) => [e.item.id, e.item]));
    return {
      available: offered.filter((o) => !have.has(o.id)),
      updates: offered.filter((o) => {
        const mine = have.get(o.id);
        return mine !== undefined && isUpdateAvailable(mine, o);
      }),
    };
  }

  /** Catalog items that are not installed yet. */
  async available(): Promise<AvailableItem[]> {
    return (await this.check()).available;
  }

  /**
   * Downloads and installs one text (or replaces it with its newer version). The package is validated
   * before it is stored, so a damaged download is rejected (the promise rejects) and nothing is left
   * half-installed. Practice progress is kept: it refers to segments by id.
   */
  async download(id: string, onProgress: (progress: DownloadProgress) => void = () => {}): Promise<CatalogItem> {
    const fetched = await this.source.fetch(id, (fraction) => onProgress({ phase: 'downloading', fraction }));
    onProgress({ phase: 'verifying', fraction: 1 });
    return this.library.installTrusted(fetched.package, fetched.duration, { source: fetched.source, packageHash: fetched.packageHash });
  }
}
