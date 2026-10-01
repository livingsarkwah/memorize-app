import { describe, expect, it } from 'vitest';
import { DownloadService, LibraryService } from '../../src/application';
import type { AvailableItem, CatalogSource, DownloadProgress, FetchedPackage } from '../../src/application';
import {
  FakeProbe, FakeReader, FakeWriter, MemoryLibraryRepository, MemoryPracticeStateRepository, makeRawPackage,
} from '../helpers/memory';

const listing = (id: string): AvailableItem => ({
  id, version: 1, title: id, titleNative: '', language: 'en', contentType: 'poem', author: 'A', addedAt: 1, segmentCount: 3, duration: 0,
});

function fetched(id: string, alignment?: unknown): FetchedPackage {
  const raw = makeRawPackage({ id });
  return {
    package: { manifest: raw.manifest as never, content: raw.content as never, alignment: (alignment ?? raw.alignment) as never, audio: raw.audio, audioName: 'audio.wav' },
    duration: 30,
    source: 'official',
  };
}

function setup(source: CatalogSource) {
  const library = new MemoryLibraryRepository();
  const libraryService = new LibraryService({
    library, practice: new MemoryPracticeStateRepository(), reader: new FakeReader(new Error('unused')), writer: new FakeWriter(), probe: new FakeProbe(30),
  });
  return { downloads: new DownloadService(source, libraryService), library };
}

describe('DownloadService', () => {
  const source: CatalogSource = {
    list: async () => [listing('a'), listing('b')],
    fetch: async (id, onProgress) => { onProgress(0.5); onProgress(1); return fetched(id); },
  };

  it('offers only what is not installed yet', async () => {
    const { downloads } = setup(source);
    expect((await downloads.available()).map((i) => i.id)).toEqual(['a', 'b']);
    await downloads.download('a');
    expect((await downloads.available()).map((i) => i.id)).toEqual(['b']);
  });

  it('installs the text and reports progress, ending with verifying', async () => {
    const { downloads, library } = setup(source);
    const seen: DownloadProgress[] = [];
    const item = await downloads.download('a', (p) => seen.push(p));
    expect(seen).toEqual([
      { phase: 'downloading', fraction: 0.5 },
      { phase: 'downloading', fraction: 1 },
      { phase: 'verifying', fraction: 1 },
    ]);
    expect(item).toMatchObject({ id: 'a', source: 'official', duration: 30, segmentCount: 3 });
    expect(await library.getItem('a')).toBeDefined();
  });

  it('rejects a damaged download and leaves nothing installed', async () => {
    const damaged: CatalogSource = { list: source.list, fetch: async (id) => fetched(id, { segments: {} }) };
    const { downloads, library } = setup(damaged);
    await expect(downloads.download('a')).rejects.toThrow(/Invalid package/);
    expect(await library.listItems()).toEqual([]);
    expect((await downloads.available()).map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('passes on a failed fetch', async () => {
    const failing: CatalogSource = { list: source.list, fetch: async () => { throw new Error('offline'); } };
    const { downloads } = setup(failing);
    await expect(downloads.download('a')).rejects.toThrow('offline');
  });
});

describe('DownloadService.check', () => {
  const offered = (id: string, extra: Partial<AvailableItem> = {}): AvailableItem => ({ ...listing(id), ...extra });
  const catalogOf = (items: AvailableItem[]): CatalogSource => ({ list: async () => items, fetch: async (id) => fetched(id) });

  it('sorts the catalog into new texts and updates to installed ones', async () => {
    let items = [offered('a', { sha256: 'h1' }), offered('b', { sha256: 'same' })];
    const source: CatalogSource = {
      list: async () => items,
      fetch: async (id) => ({ ...fetched(id), packageHash: items.find((i) => i.id === id)!.sha256 }),
    };
    const { downloads } = setup(source);
    await downloads.download('a');
    await downloads.download('b');

    items = [offered('a', { sha256: 'h2' }), offered('b', { sha256: 'same' }), offered('c')];
    const result = await downloads.check();
    expect(result.available.map((i) => i.id)).toEqual(['c']);
    expect(result.updates.map((i) => i.id)).toEqual(['a']);
  });

  it('offers a changed text as an update, and installing it replaces the old files', async () => {
    let published = offered('a', { sha256: 'h1', version: 1 });
    const source: CatalogSource = {
      list: async () => [published],
      fetch: async (id, onProgress) => { onProgress(1); return { ...fetched(id), packageHash: published.sha256 }; },
    };
    const { downloads, library } = setup(source);
    await downloads.download('a');
    expect((await library.getItem('a'))?.packageHash).toBe('h1');
    expect(await downloads.check()).toEqual({ available: [], updates: [] });

    published = offered('a', { sha256: 'h2', version: 2 });
    const { available, updates } = await downloads.check();
    expect(available).toEqual([]);
    expect(updates.map((u) => u.id)).toEqual(['a']);

    await downloads.download('a');
    expect((await library.getItem('a'))?.packageHash).toBe('h2');
    expect((await downloads.check()).updates).toEqual([]);
    expect(await library.listItems()).toHaveLength(1); // replaced, not duplicated
  });

  it('never offers updates for texts the person imported', async () => {
    const { downloads, library } = setup(catalogOf([offered('a', { sha256: 'h9' })]));
    await downloads.download('a');
    const item = (await library.getItem('a'))!;
    await library.save({ ...item, source: 'imported', packageHash: undefined }, (await library.getPackage('a'))!);
    expect((await downloads.check()).updates).toEqual([]);
  });
});
