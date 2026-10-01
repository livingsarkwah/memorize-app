import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import type { PackageRecord } from '../../src/application';
import type { CatalogItem } from '../../src/domain';
import { DexieLibraryRepository, DexieLocalData, DexiePracticeStateRepository, DexieSettingsRepository, MemorizeDb } from '../../src/infrastructure';
import { makeRawPackage } from '../helpers/memory';

let n = 0;
const name = () => `dexie-${++n}-${Math.random().toString(36).slice(2)}`;

const item = (id: string): CatalogItem => ({
  id, version: 1, title: id, titleNative: '', language: 'en', contentType: 'poem', author: 'A', addedAt: 1, source: 'imported', segmentCount: 3, duration: 6.5,
});
const record = (id: string): PackageRecord => {
  const raw = makeRawPackage({ id });
  return { id, manifest: raw.manifest as never, content: raw.content as never, alignment: raw.alignment as never, audio: raw.audio, audioName: raw.audioName };
};

describe('Dexie storage specifics', () => {
  it('keeps data after the database is closed and reopened', async () => {
    const dbName = name();
    const first = new MemorizeDb(dbName);
    await new DexieLibraryRepository(first).save(item('a'), record('a'));
    await new DexiePracticeStateRepository(first).put({ itemId: 'a', lastSegmentId: 'v1a', rangeStartId: 'v1a', rangeEndId: 'v1b', mode: 'range', count: 3, pause: 2, rate: 1, lastPlayedAt: 5 });
    await new DexieSettingsRepository(first).save({ theme: 'dark', textSize: 'l', titles: 'native', showTranslation: true, practiceDefaults: { rate: 1.5, pause: 5, count: 9 } });
    first.close();

    const second = new MemorizeDb(dbName);
    expect((await new DexieLibraryRepository(second).getItem('a'))?.title).toBe('a');
    expect(await (await new DexieLibraryRepository(second).getPackage('a'))!.audio.text()).toBe('fake audio bytes');
    expect((await new DexiePracticeStateRepository(second).get('a'))?.lastPlayedAt).toBe(5);
    expect((await new DexieSettingsRepository(second).load()).theme).toBe('dark');
    second.close();
  });

  it('writes metadata and package in one transaction: a failure leaves neither behind', async () => {
    const db = new MemorizeDb(name());
    const library = new DexieLibraryRepository(db);
    // No primary key on the metadata row makes the second write fail, after the package was already written.
    await expect(library.save({ ...item('a'), id: undefined as never }, record('a'))).rejects.toThrow();
    expect(await db.documents.count()).toBe(0);
    expect(await db.audio.count()).toBe(0);
    expect(await db.items.count()).toBe(0);
    db.close();
  });

  it('reading a text\'s document does not touch its audio', async () => {
    const db = new MemorizeDb(name());
    const library = new DexieLibraryRepository(db);
    await library.save(item('a'), record('a'));
    const document = (await library.getDocument('a'))!;
    expect(document.content).toEqual(record('a').content);
    expect(Object.keys(document)).not.toContain('audio');
    expect(await (await library.getAudio('a'))!.text()).toBe('fake audio bytes');
    db.close();
  });

  it('listing the library reads only the small items table, never the audio', async () => {
    const db = new MemorizeDb(name());
    const library = new DexieLibraryRepository(db);
    await library.save(item('a'), record('a'));
    const listed = await library.listItems();
    expect(Object.keys(listed[0]!)).not.toContain('audio');
    expect(Object.keys(listed[0]!)).not.toContain('content');
    db.close();
  });

  it('clearAll wipes every table', async () => {
    const db = new MemorizeDb(name());
    await new DexieLibraryRepository(db).save(item('a'), record('a'));
    await new DexiePracticeStateRepository(db).put({ itemId: 'a', lastSegmentId: 'v1a', rangeStartId: 'v1a', rangeEndId: 'v1b', mode: 'range', count: 3, pause: 2, rate: 1 });
    await new DexieSettingsRepository(db).save({ theme: 'dark', textSize: 'm', titles: 'both', showTranslation: false, practiceDefaults: { rate: 1, pause: 2, count: 3 } });
    await new DexieLocalData(db).clearAll();
    expect((await Promise.all([db.items.count(), db.documents.count(), db.audio.count(), db.practice.count(), db.settings.count()])).reduce((a, b) => a + b, 0)).toBe(0);
    expect((await new DexieSettingsRepository(db).load()).theme).toBe('system');
    db.close();
  });

  it('can query practice history by last-played time via its index', async () => {
    const db = new MemorizeDb(name());
    const practice = new DexiePracticeStateRepository(db);
    for (const [id, t] of [['a', 3], ['b', 9], ['c', 1]] as const) {
      await practice.put({ itemId: id, lastSegmentId: 'v1a', rangeStartId: 'v1a', rangeEndId: 'v1b', mode: 'range', count: 3, pause: 2, rate: 1, lastPlayedAt: t });
    }
    expect((await db.practice.orderBy('lastPlayedAt').reverse().first())?.itemId).toBe('b');
    db.close();
  });
});

describe('database upgrade from the stage 2 layout', () => {
  it('moves every stored package into documents and audio, and keeps everything else', async () => {
    const dbName = name();

    // Build a database exactly as stage 2 left it (schema version 1).
    const old = new Dexie(dbName);
    old.version(1).stores({ items: 'id, title, addedAt', packages: 'id', practice: 'itemId, lastPlayedAt', settings: 'key' });
    await old.table('items').put(item('a'));
    await old.table('items').put(item('b'));
    await old.table('packages').put(record('a'));
    await old.table('packages').put(record('b'));
    await old.table('practice').put({ itemId: 'a', lastSegmentId: 'v1b', rangeStartId: 'v1a', rangeEndId: 'v1b', mode: 'each', count: 4, pause: 'auto', rate: 0.75, lastPlayedAt: 77 });
    await old.table('settings').put({ key: 'app', value: { theme: 'dark' } });
    old.close();

    // Open it with the current code: the upgrade runs.
    const db = new MemorizeDb(dbName);
    const library = new DexieLibraryRepository(db);
    expect((await library.listItems()).map((i) => i.id).sort()).toEqual(['a', 'b']);
    const pkg = (await library.getPackage('a'))!;
    expect(pkg.content).toEqual(record('a').content);
    expect(pkg.alignment).toEqual(record('a').alignment);
    expect(pkg.audioName).toBe('audio.mp3');
    expect(await pkg.audio.text()).toBe('fake audio bytes');
    expect(await (await library.getAudio('b'))!.text()).toBe('fake audio bytes');
    expect((await new DexiePracticeStateRepository(db).get('a'))).toMatchObject({ lastPlayedAt: 77, mode: 'each' });
    expect((await new DexieSettingsRepository(db).load()).theme).toBe('dark');
    expect(db.tables.map((t) => t.name).sort()).toEqual(['audio', 'documents', 'items', 'practice', 'settings']);
    db.close();
  });
});

describe('database upgrade from the stage 3 layout (version 3 to 4)', () => {
  it("renames the 'sample' source to 'official' and leaves everything else alone", async () => {
    const dbName = name();
    const old = new Dexie(dbName);
    old.version(1).stores({ items: 'id, title, addedAt', packages: 'id', practice: 'itemId, lastPlayedAt', settings: 'key' });
    old.version(2).stores({ documents: 'id', audio: 'id' });
    old.version(3).stores({ packages: null });
    await old.table('items').bulkPut([
      { ...item('installed-sample'), source: 'sample' },
      { ...item('my-import'), source: 'imported' },
    ]);
    await old.table('documents').put({ id: 'installed-sample', manifest: {}, content: {}, alignment: {}, audioName: 'audio.wav' });
    await old.table('audio').put({ id: 'installed-sample', blob: new Blob(['x']) });
    await old.table('practice').put({ itemId: 'installed-sample', lastSegmentId: 'v1a', rangeStartId: 'v1a', rangeEndId: 'v1b', mode: 'range', count: 3, pause: 2, rate: 1, lastPlayedAt: 9 });
    old.close();

    const db = new MemorizeDb(dbName);
    const library = new DexieLibraryRepository(db);
    expect((await library.getItem('installed-sample'))?.source).toBe('official');
    expect((await library.getItem('my-import'))?.source).toBe('imported');
    expect((await library.getItem('installed-sample'))?.packageHash).toBeUndefined(); // so the real package is offered as an update
    expect(await db.documents.count()).toBe(1);
    expect(await db.audio.count()).toBe(1);
    expect((await new DexiePracticeStateRepository(db).get('installed-sample'))?.lastPlayedAt).toBe(9);
    db.close();
  });
});
