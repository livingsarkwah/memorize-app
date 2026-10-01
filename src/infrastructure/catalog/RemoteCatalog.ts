import type { AlignmentDoc, ContentDoc, Manifest } from '../../domain';
import type { AvailableItem, CatalogIndex, CatalogSource, FetchedPackage, PackageReader, RemoteCatalogEntry } from '../../application';
import { DownloadError, PackageDownloader } from './PackageDownloader';

/**
 * The app's catalog of official texts. It knows how to turn catalog entries into things to show, and how
 * to download, verify and unpack a text. WHERE the entries come from (a static file published with the
 * app, or a database such as Supabase) is the `CatalogIndex`, so moving to a database later means
 * passing a different index and nothing else.
 */
export class RemoteCatalog implements CatalogSource {
  constructor(
    private readonly index: CatalogIndex,
    private readonly reader: PackageReader,
    private readonly downloader: PackageDownloader = new PackageDownloader(),
  ) {}

  async list(): Promise<AvailableItem[]> {
    const entries = await this.index.load();
    return entries.map(toAvailableItem);
  }

  async fetch(id: string, onProgress: (fraction: number) => void): Promise<FetchedPackage> {
    const entry = (await this.index.load()).find((e) => e.id === id);
    if (!entry) throw new DownloadError(`“${id}” is no longer in the catalog.`);

    const zip = await this.downloader.download(entry.package, onProgress);
    const raw = await this.reader.read(zip);

    const manifest = raw.manifest as Manifest;
    if (manifest?.contentId !== entry.id) {
      throw new DownloadError('The downloaded package is not the text that was asked for. Please try again later.');
    }
    return {
      package: {
        manifest,
        content: raw.content as ContentDoc,
        alignment: raw.alignment as AlignmentDoc,
        audio: raw.audio,
        audioName: raw.audioName,
      },
      duration: entry.duration,
      source: 'official',
      packageHash: entry.package.sha256,
    };
  }
}

export function toAvailableItem(e: RemoteCatalogEntry): AvailableItem {
  const published = e.publishedAt ? Date.parse(e.publishedAt) : NaN;
  return {
    id: e.id,
    version: e.version,
    title: e.title,
    titleNative: e.titleNative,
    language: e.language,
    contentType: e.contentType,
    author: e.author,
    ...(e.reciter ? { reciter: e.reciter } : {}),
    segmentCount: e.segmentCount,
    duration: e.duration,
    addedAt: Number.isFinite(published) ? published : 0,
    ...(e.publishedAt ? { publishedAt: e.publishedAt } : {}),
    sizeBytes: e.package.sizeBytes,
    sha256: e.package.sha256,
  };
}
