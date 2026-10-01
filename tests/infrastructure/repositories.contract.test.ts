import { beforeEach, describe, expect, it } from 'vitest';
import type { LibraryRepository, PackageRecord, PracticeStateRepository, SettingsRepository } from '../../src/application';
import { DEFAULT_SETTINGS } from '../../src/domain';
import type { CatalogItem, PracticeState } from '../../src/domain';
import { DexieLibraryRepository, DexiePracticeStateRepository, DexieSettingsRepository, MemorizeDb } from '../../src/infrastructure';
import { MemoryLibraryRepository, MemoryPracticeStateRepository, MemorySettingsRepository, makeRawPackage } from '../helpers/memory';

/**
 * One set of behaviours, run against every implementation of the storage ports.
 * If a new implementation (or a future sync layer) passes these, the app can use it.
 */
interface Impl {
  library: LibraryRepository;
  practice: PracticeStateRepository;
  settings: SettingsRepository;
}

let counter = 0;
const implementations: [string, () => Impl][] = [
  ['in-memory', () => ({ library: new MemoryLibraryRepository(), practice: new MemoryPracticeStateRepository(), settings: new MemorySettingsRepository() })],
  ['Dexie / IndexedDB', () => {
    const db = new MemorizeDb(`contract-${++counter}`);
    return { library: new DexieLibraryRepository(db), practice: new DexiePracticeStateRepository(db), settings: new DexieSettingsRepository(db) };
  }],
];

const item = (id: string): CatalogItem => ({
  id, version: 1, title: id, titleNative: '', language: 'en', contentType: 'poem', author: 'A', addedAt: 1, source: 'imported', segmentCount: 3, duration: 6.5,
});
const record = (id: string): PackageRecord => {
  const raw = makeRawPackage({ id });
  return { id, manifest: raw.manifest as never, content: raw.content as never, alignment: raw.alignment as never, audio: raw.audio, audioName: raw.audioName };
};
const state = (itemId: string, over: Partial<PracticeState> = {}): PracticeState => ({
  itemId, lastSegmentId: 'v1a', rangeStartId: 'v1a', rangeEndId: 'v1b', mode: 'range', count: 3, pause: 2, rate: 1, lastPlayedAt: 100, ...over,
});

describe.each(implementations)('storage contract: %s', (_name, make) => {
  let impl: Impl;
  beforeEach(() => { impl = make(); });

  describe('library', () => {
    it('starts empty', async () => {
      expect(await impl.library.listItems()).toEqual([]);
      expect(await impl.library.getItem('x')).toBeUndefined();
      expect(await impl.library.getPackage('x')).toBeUndefined();
    });

    it('saves and reads back metadata and package, including the audio Blob', async () => {
      await impl.library.save(item('a'), record('a'));
      expect(await impl.library.getItem('a')).toEqual(item('a'));
      const pkg = (await impl.library.getPackage('a'))!;
      expect(pkg.content).toEqual(record('a').content);
      expect(pkg.alignment).toEqual(record('a').alignment);
      expect(await pkg.audio.text()).toBe('fake audio bytes');
      expect(pkg.audio.type).toBe('audio/mpeg');
    });

    it('reads the document and the audio separately', async () => {
      await impl.library.save(item('a'), record('a'));
      const doc = (await impl.library.getDocument('a'))!;
      expect(doc.content).toEqual(record('a').content);
      expect(doc.audioName).toBe('audio.mp3');
      expect('audio' in doc).toBe(false);
      expect(await (await impl.library.getAudio('a'))!.text()).toBe('fake audio bytes');
      expect(await impl.library.getDocument('missing')).toBeUndefined();
      expect(await impl.library.getAudio('missing')).toBeUndefined();
    });

    it('lists metadata for every item', async () => {
      await impl.library.save(item('a'), record('a'));
      await impl.library.save(item('b'), record('b'));
      expect((await impl.library.listItems()).map((i) => i.id).sort()).toEqual(['a', 'b']);
    });

    it('replaces an existing item with the same id', async () => {
      await impl.library.save(item('a'), record('a'));
      await impl.library.save({ ...item('a'), title: 'Updated' }, record('a'));
      expect(await impl.library.listItems()).toHaveLength(1);
      expect((await impl.library.getItem('a'))?.title).toBe('Updated');
    });

    it('removes metadata and package together, and ignores unknown ids', async () => {
      await impl.library.save(item('a'), record('a'));
      await impl.library.remove('a');
      await impl.library.remove('never-existed');
      expect(await impl.library.getItem('a')).toBeUndefined();
      expect(await impl.library.getPackage('a')).toBeUndefined();
      expect(await impl.library.getDocument('a')).toBeUndefined();
      expect(await impl.library.getAudio('a')).toBeUndefined();
    });
  });

  describe('practice state', () => {
    it('stores one state per text and lists them', async () => {
      await impl.practice.put(state('a'));
      await impl.practice.put(state('b', { rate: 0.5 }));
      await impl.practice.put(state('a', { lastSegmentId: 'v1b' }));
      expect(await impl.practice.get('a')).toMatchObject({ lastSegmentId: 'v1b' });
      expect(await impl.practice.get('missing')).toBeUndefined();
      expect((await impl.practice.list()).map((s) => s.itemId).sort()).toEqual(['a', 'b']);
    });

    it('preserves the "forever" pause and undefined last-played time', async () => {
      await impl.practice.put(state('a', { pause: 'auto', count: 0, lastPlayedAt: undefined }));
      const got = (await impl.practice.get('a'))!;
      expect(got).toMatchObject({ pause: 'auto', count: 0 });
      expect(got.lastPlayedAt).toBeUndefined();
    });
  });

  describe('settings', () => {
    it('returns the defaults when nothing is stored', async () => {
      expect(await impl.settings.load()).toEqual(DEFAULT_SETTINGS);
    });

    it('round-trips saved settings', async () => {
      const custom = { ...DEFAULT_SETTINGS, theme: 'dark' as const, titles: 'native' as const, practiceDefaults: { rate: 0.75, pause: 'auto' as const, count: 0 } };
      await impl.settings.save(custom);
      expect(await impl.settings.load()).toEqual(custom);
    });

    it('sanitizes corrupted stored settings on load', async () => {
      await impl.settings.save({ ...DEFAULT_SETTINGS, theme: 'neon' as never });
      expect((await impl.settings.load()).theme).toBe('system');
    });
  });
});
