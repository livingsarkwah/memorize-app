import { catalogItemFrom, pickContinueEntry, searchLibrary, sortLibrary, validatePackage } from '../domain';
import type { AlignmentDoc, CatalogItem, ContentDoc, ItemSource, LibraryEntry, LibrarySort, Manifest } from '../domain';
import { flatten } from '../domain';
import type { ContentStructure } from '../domain';
import { PackageReadError } from './packages';
import type { AudioDurationProbe, ImportResult, PackageReader, PackageRecord, PackageWriter, RawPackage } from './packages';
import { systemClock } from './repositories';
import type { Clock, LibraryRepository, PracticeStateRepository } from './repositories';

export interface LibraryDeps {
  library: LibraryRepository;
  practice: PracticeStateRepository;
  reader: PackageReader;
  writer: PackageWriter;
  probe: AudioDurationProbe;
  clock?: Clock;
}

/** A package whose parts are already typed, e.g. a built-in sample. */
export interface TrustedPackage {
  manifest: Manifest;
  content: ContentDoc;
  alignment: AlignmentDoc;
  audio: Blob;
  audioName?: string;
}

export interface InstallOptions {
  /** Defaults to 'official'. */
  source?: ItemSource;
  /** SHA-256 of the package, so a later change to it can be noticed. */
  packageHash?: string;
}

/** The local library: what is installed, importing new packages, removing, exporting. */
export class LibraryService {
  private readonly clock: Clock;

  constructor(private readonly deps: LibraryDeps) {
    this.clock = deps.clock ?? systemClock;
  }

  /** Every installed text with its saved practice state. */
  async entries(): Promise<LibraryEntry[]> {
    const [items, states] = await Promise.all([this.deps.library.listItems(), this.deps.practice.list()]);
    const byId = new Map(states.map((s) => [s.itemId, s]));
    return items.map((item) => ({ item, practice: byId.get(item.id) }));
  }

  async list(sort: LibrarySort = 'recent', query = ''): Promise<LibraryEntry[]> {
    return sortLibrary(searchLibrary(await this.entries(), query), sort);
  }

  async continueEntry(): Promise<LibraryEntry | undefined> {
    return pickContinueEntry(await this.entries());
  }

  /** Reads a ZIP, validates it, and stores it. Never throws for bad input; returns a result to show. */
  async importPackage(file: Blob): Promise<ImportResult> {
    let raw: RawPackage;
    try {
      raw = await this.deps.reader.read(file);
    } catch (e) {
      const message = e instanceof PackageReadError ? e.message : 'This file could not be read.';
      return { ok: false, message, problems: [] };
    }

    const duration = await this.deps.probe.probe(raw.audio);
    if (duration < 0) {
      return { ok: false, message: 'The audio file could not be played in this browser. Try MP3 or M4A.', problems: [] };
    }

    const problems = validatePackage(raw.manifest, raw.content, raw.alignment, duration);
    if (problems.length > 0) {
      return { ok: false, message: 'The package has problems that need fixing before it can be used:', problems };
    }

    const manifest = raw.manifest as Manifest;
    const existing = await this.deps.library.getItem(manifest.contentId);
    if (existing?.source === 'official') {
      return {
        ok: false,
        message: `The contentId “${manifest.contentId}” is already used by one of the app’s own texts. Choose a different contentId.`,
        problems: [],
      };
    }

    const item = await this.store(
      { manifest, content: raw.content as ContentDoc, alignment: raw.alignment as AlignmentDoc, audio: raw.audio, audioName: raw.audioName },
      duration,
      'imported',
    );
    return { ok: true, item, replaced: existing !== undefined };
  }

  /** Installs a package delivered by the app's own catalog. Still validated; throws if invalid. */
  async installTrusted(pkg: TrustedPackage, duration: number, options: InstallOptions = {}): Promise<CatalogItem> {
    const problems = validatePackage(pkg.manifest, pkg.content, pkg.alignment, duration);
    if (problems.length > 0) throw new Error(`Invalid package: ${problems.join(' ')}`);
    return this.store({ ...pkg, audioName: pkg.audioName ?? 'audio.wav' }, duration, options.source ?? 'official', options.packageHash);
  }

  /** The text's structure (segments, verses, sections) without loading its audio. */
  async structure(id: string): Promise<ContentStructure | undefined> {
    const doc = await this.deps.library.getDocument(id);
    return doc ? flatten(doc.content) : undefined;
  }

  /** Removes the text and its files. Practice history is deliberately kept. */
  remove(id: string): Promise<void> {
    return this.deps.library.remove(id);
  }

  /** Rebuilds a ZIP for an installed text, in the same format the importer reads. */
  async exportPackage(id: string, asContentId?: string, asTitle?: string): Promise<Blob> {
    const record = await this.deps.library.getPackage(id);
    if (!record) throw new Error('That text is not installed.');
    const manifest: Manifest = {
      ...record.manifest,
      contentId: asContentId ?? record.manifest.contentId,
      title: asTitle ?? record.manifest.title,
      audio: record.audioName,
      content: 'content.json',
      alignment: 'alignment.json',
    };
    return this.deps.writer.write({ manifest, content: record.content, alignment: record.alignment, audio: record.audio, audioName: record.audioName });
  }

  private async store(
    pkg: Required<TrustedPackage>,
    duration: number,
    source: ItemSource,
    packageHash?: string,
  ): Promise<CatalogItem> {
    const item = catalogItemFrom(pkg.manifest, {
      addedAt: this.clock.now(),
      source,
      segmentCount: flatten(pkg.content).segments.length,
      duration,
      ...(packageHash ? { packageHash } : {}),
    });
    const record: PackageRecord = {
      id: item.id,
      manifest: pkg.manifest,
      content: pkg.content,
      alignment: pkg.alignment,
      audio: pkg.audio,
      audioName: pkg.audioName,
    };
    await this.deps.library.save(item, record);
    return item;
  }
}
