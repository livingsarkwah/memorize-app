import type { AlignmentDoc, CatalogItem, ContentDoc, Manifest } from '../domain';

/** The files of a content package, parsed but not yet trusted. */
export interface RawPackage {
  manifest: unknown;
  content: unknown;
  alignment: unknown;
  audio: Blob;
  /** File name of the audio inside the package, e.g. "audio.mp3". */
  audioName: string;
}

/** A package that passed validation, ready to store. */
export interface PackageRecord {
  /** Same as the catalog item id (manifest.contentId). */
  id: string;
  manifest: Manifest;
  content: ContentDoc;
  alignment: AlignmentDoc;
  audio: Blob;
  audioName: string;
}

/** A stored package without its audio: small enough to read whenever the text itself is needed. */
export type PackageDocument = Omit<PackageRecord, 'audio'>;

/** Thrown by a PackageReader when a file cannot be read as a package. The message is safe to show. */
export class PackageReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PackageReadError';
  }
}

/** Thrown when a stored or imported package fails validation. */
export class PackageProblemError extends Error {
  constructor(
    message: string,
    readonly problems: string[],
  ) {
    super(message);
    this.name = 'PackageProblemError';
  }
}

/** Reads a ZIP (or other container) into its parts. Throws PackageReadError. */
export interface PackageReader {
  read(file: Blob): Promise<RawPackage>;
}

/** Writes a package back out as a ZIP. */
export interface PackageWriter {
  write(pkg: { manifest: Manifest; content: ContentDoc; alignment: AlignmentDoc; audio: Blob; audioName: string }): Promise<Blob>;
}

/** Measures audio length. Returns seconds, 0 if unknown, and -1 if the audio cannot be played. */
export interface AudioDurationProbe {
  probe(audio: Blob): Promise<number>;
}

export type ImportResult =
  | { ok: true; item: CatalogItem; replaced: boolean }
  | { ok: false; message: string; problems: string[] };
