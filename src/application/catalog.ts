import type { ItemSource } from '../domain';
import type { TrustedPackage } from './LibraryService';

/** A text offered for download. Metadata only; the files are fetched separately. */
export interface AvailableItem {
  id: string;
  version: number | string;
  title: string;
  titleNative: string;
  language: string;
  contentType: string;
  author: string;
  reciter?: string;
  segmentCount: number;
  /** Audio length in seconds, 0 if unknown. */
  duration: number;
  /** Epoch ms the text was published, 0 if unknown. Used for sorting. */
  addedAt: number;
  /** ISO date the text was published, when known. Drives the "New" label. */
  publishedAt?: string;
  /** Size of the download in bytes, when known. */
  sizeBytes?: number;
  /** SHA-256 of the package. Lets the app tell that an installed text has changed. */
  sha256?: string;
}

/** The files for one text, as delivered by a catalog. */
export interface FetchedPackage {
  package: TrustedPackage;
  duration: number;
  source: ItemSource;
  /** SHA-256 of the package that was downloaded, when the catalog provides one. */
  packageHash?: string;
}

/**
 * Where official texts come from. Today a static catalog published with the app; later a database
 * and object storage (for example Supabase) behind the same interface.
 */
export interface CatalogSource {
  list(): Promise<AvailableItem[]>;
  /** Fetches the package, reporting progress from 0 to 1. */
  fetch(id: string, onProgress: (fraction: number) => void): Promise<FetchedPackage>;
}

/**
 * One text in a remote catalog, in the shape the catalog is stored: the same fields whether they come
 * from the static `catalog.json` or from a database row. `package.url` may be relative to the catalog.
 */
export interface RemoteCatalogEntry {
  id: string;
  version: number | string;
  title: string;
  titleNative: string;
  language: string;
  contentType: string;
  author: string;
  reciter?: string;
  segmentCount: number;
  duration: number;
  /** ISO date, when known. */
  publishedAt?: string;
  package: { url: string; sha256: string; sizeBytes: number };
}

/** Loads the list of remote entries. The only part that differs between a static file and a database. */
export interface CatalogIndex {
  load(): Promise<RemoteCatalogEntry[]>;
}

export type DownloadPhase = 'downloading' | 'verifying';
export interface DownloadProgress {
  phase: DownloadPhase;
  /** 0 to 1. */
  fraction: number;
}
