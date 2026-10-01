import { applyAlignment, flatten, resolvePracticeSetup, toPracticeState, validatePackage } from '../domain';
import type { CatalogItem, ContentStructure, PracticeConfig, PracticeSetup, TimedSegment } from '../domain';
import { PackageProblemError } from './packages';
import { systemClock } from './repositories';
import type { Clock, LibraryRepository, PracticeStateRepository } from './repositories';
import type { SettingsService } from './SettingsService';

/** Everything the player needs to start practicing a text. */
export interface OpenedItem {
  item: CatalogItem;
  structure: ContentStructure<TimedSegment>;
  audio: Blob;
  /** Where to start: saved progress if any, otherwise the first verse and default settings. */
  setup: PracticeSetup;
}

/** Opens texts for practice and saves progress. */
export class PracticeService {
  private readonly clock: Clock;

  constructor(
    private readonly library: LibraryRepository,
    private readonly practice: PracticeStateRepository,
    private readonly settings: SettingsService,
    clock?: Clock,
  ) {
    this.clock = clock ?? systemClock;
  }

  /**
   * Loads a text and re-validates it: stored data can be damaged (a partial write,
   * a browser clearing part of a database), and a bad package must never reach the engine.
   */
  async open(itemId: string): Promise<OpenedItem> {
    const [item, record] = await Promise.all([this.library.getItem(itemId), this.library.getPackage(itemId)]);
    if (!item || !record) throw new PackageProblemError('That text is not installed.', []);

    const problems = validatePackage(record.manifest, record.content, record.alignment, item.duration);
    if (problems.length > 0) {
      throw new PackageProblemError('This content package could not be loaded. The package appears to be incomplete.', problems);
    }

    const flat = flatten(record.content);
    const structure: ContentStructure<TimedSegment> = { ...flat, segments: applyAlignment(flat.segments, record.alignment) };
    const [saved, settings] = await Promise.all([this.practice.get(itemId), this.settings.get()]);
    return { item, structure, audio: record.audio, setup: resolvePracticeSetup(structure, saved, settings.practiceDefaults) };
  }

  /**
   * Saves the current position and settings. `touch` marks that playback started or
   * stopped, which updates "last practiced"; plain setting changes keep the old time.
   */
  async saveProgress(
    itemId: string,
    segments: readonly TimedSegment[],
    position: { seg: number; config: PracticeConfig },
    touch: boolean,
  ): Promise<void> {
    const previous = await this.practice.get(itemId);
    const lastPlayedAt = touch ? this.clock.now() : previous?.lastPlayedAt;
    await this.practice.put(toPracticeState(itemId, segments, position.seg, position.config, lastPlayedAt));
  }
}
