import { DEFAULT_SETTINGS, sanitizeSettings } from '../../src/domain';
import type { AppSettings, CatalogItem, PracticeState } from '../../src/domain';
import { PackageReadError } from '../../src/application';
import type {
  AudioDurationProbe, Clock, LibraryRepository, PackageReader, PackageRecord, PackageWriter,
  PracticeStateRepository, RawPackage, SettingsRepository,
} from '../../src/application';

/** In-memory repositories: the reference behaviour every real implementation must match. */
export class MemoryLibraryRepository implements LibraryRepository {
  items = new Map<string, CatalogItem>();
  packages = new Map<string, PackageRecord>();
  async listItems() { return [...this.items.values()]; }
  async getItem(id: string) { return this.items.get(id); }
  async getDocument(id: string) {
    const record = this.packages.get(id);
    if (!record) return undefined;
    const { audio: _audio, ...document } = record;
    void _audio;
    return document;
  }
  async getAudio(id: string) { return this.packages.get(id)?.audio; }
  async getPackage(id: string) { return this.packages.get(id); }
  async save(item: CatalogItem, record: PackageRecord) { this.packages.set(record.id, record); this.items.set(item.id, item); }
  async remove(id: string) { this.items.delete(id); this.packages.delete(id); }
}

export class MemoryPracticeStateRepository implements PracticeStateRepository {
  states = new Map<string, PracticeState>();
  async get(id: string) { return this.states.get(id); }
  async list() { return [...this.states.values()]; }
  async put(state: PracticeState) { this.states.set(state.itemId, state); }
}

export class MemorySettingsRepository implements SettingsRepository {
  stored: AppSettings | undefined;
  async load() { return this.stored ? sanitizeSettings(this.stored) : structuredClone(DEFAULT_SETTINGS); }
  async save(settings: AppSettings) { this.stored = settings; }
}

/** A clock that only moves when told to. */
export class FixedClock implements Clock {
  constructor(public time = 1_000_000) {}
  now() { return this.time; }
  tick(ms = 1000) { this.time += ms; }
}

/** Reader that returns a prepared package, or throws a prepared error. */
export class FakeReader implements PackageReader {
  constructor(public result: RawPackage | Error) {}
  async read(): Promise<RawPackage> {
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

export class FakeWriter implements PackageWriter {
  written: Parameters<PackageWriter['write']>[0][] = [];
  async write(pkg: Parameters<PackageWriter['write']>[0]) { this.written.push(pkg); return new Blob(['zip'], { type: 'application/zip' }); }
}

export class FakeProbe implements AudioDurationProbe {
  constructor(public duration = 30) {}
  async probe() { return this.duration; }
}

export { PackageReadError };

/** A small valid package: two segments in one verse plus a lone segment in a second section. */
export function makeRawPackage(overrides: Partial<RawPackage> & { id?: string; title?: string } = {}): RawPackage {
  const id = overrides.id ?? 'my-poem';
  return {
    manifest: { schemaVersion: 1, contentId: id, version: 1, title: overrides.title ?? 'My Poem', language: 'en', contentType: 'poem', author: 'Someone', audio: 'audio.mp3' },
    content: {
      sections: [
        { id: 's1', groups: [{ id: 'v1', label: 'Verse 1', segments: [{ id: 'v1a', text: 'first half' }, { id: 'v1b', text: 'second half' }] }] },
        { id: 's2', segments: [{ id: 'x1', text: 'a lone line' }] },
      ],
    },
    alignment: { segments: { v1a: { start: 0.5, end: 2 }, v1b: { start: 2.4, end: 4 }, x1: { start: 5, end: 6.5 } } },
    audio: new Blob(['fake audio bytes'], { type: 'audio/mpeg' }),
    audioName: 'audio.mp3',
    ...overrides,
  };
}
