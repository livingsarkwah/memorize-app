import { beforeEach, describe, expect, it } from 'vitest';
import { LibraryService, PackageReadError } from '../../src/application';
import {
  FakeProbe, FakeReader, FakeWriter, FixedClock, MemoryLibraryRepository, MemoryPracticeStateRepository, makeRawPackage,
} from '../helpers/memory';

function setup(reader = new FakeReader(makeRawPackage()), duration = 30) {
  const library = new MemoryLibraryRepository();
  const practice = new MemoryPracticeStateRepository();
  const writer = new FakeWriter();
  const probe = new FakeProbe(duration);
  const clock = new FixedClock(5_000);
  const service = new LibraryService({ library, practice, reader, writer, probe, clock });
  return { service, library, practice, writer, probe, clock, reader };
}

const file = new Blob(['zip']);

describe('LibraryService.importPackage', () => {
  it('stores a valid package with its metadata', async () => {
    const { service, library } = setup();
    const result = await service.importPackage(file);
    expect(result).toMatchObject({ ok: true, replaced: false });
    if (!result.ok) return;
    expect(result.item).toMatchObject({ id: 'my-poem', title: 'My Poem', source: 'imported', segmentCount: 3, duration: 30, addedAt: 5_000, author: 'Someone' });
    expect(await library.getItem('my-poem')).toEqual(result.item);
    expect((await library.getPackage('my-poem'))?.audioName).toBe('audio.mp3');
  });

  it('shows the reader’s message when the file cannot be read', async () => {
    const { service, library } = setup(new FakeReader(new PackageReadError('This file is not a valid ZIP archive.')));
    expect(await service.importPackage(file)).toEqual({ ok: false, message: 'This file is not a valid ZIP archive.', problems: [] });
    expect(await library.listItems()).toEqual([]);
  });

  it('uses a generic message for unexpected reader errors', async () => {
    const { service } = setup(new FakeReader(new Error('boom: internal detail')));
    expect(await service.importPackage(file)).toEqual({ ok: false, message: 'This file could not be read.', problems: [] });
  });

  it('refuses audio the browser cannot play', async () => {
    const { service, library } = setup(undefined, -1);
    const result = await service.importPackage(file);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/could not be played/);
    expect(await library.listItems()).toEqual([]);
  });

  it('returns validation problems and stores nothing', async () => {
    const bad = makeRawPackage({ alignment: { segments: { v1a: { start: 0.5, end: 2 } } } });
    const { service, library } = setup(new FakeReader(bad));
    const result = await service.importPackage(file);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems).toEqual(['Segment "v1b" has no alignment entry.', 'Segment "x1" has no alignment entry.']);
    expect(await library.listItems()).toEqual([]);
    expect(library.packages.size).toBe(0);
  });

  it('checks segment times against the real audio length', async () => {
    const { service } = setup(undefined, 3); // package says a segment ends at 6.5 s
    const result = await service.importPackage(file);
    expect(result.ok).toBe(false);
  });

  it('accepts a package when the audio length is unknown', async () => {
    const { service } = setup(undefined, 0);
    expect((await service.importPackage(file)).ok).toBe(true);
  });

  it('re-importing the same contentId replaces it and keeps practice history', async () => {
    const { service, library, practice } = setup();
    await service.importPackage(file);
    await practice.put({ itemId: 'my-poem', lastSegmentId: 'v1b', rangeStartId: 'v1a', rangeEndId: 'v1b', mode: 'range', count: 3, pause: 2, rate: 1, lastPlayedAt: 42 });
    const result = await service.importPackage(file);
    expect(result).toMatchObject({ ok: true, replaced: true });
    expect(await library.listItems()).toHaveLength(1);
    expect((await practice.get('my-poem'))?.lastPlayedAt).toBe(42);
  });

  it('will not overwrite one of the app’s own texts', async () => {
    const { service, library } = setup();
    await service.installTrusted(
      { manifest: { schemaVersion: 1, contentId: 'my-poem', version: 1, title: 'Sample', language: 'en' }, content: makeRawPackage().content as never, alignment: makeRawPackage().alignment as never, audio: new Blob(['a']) },
      30,
    );
    const result = await service.importPackage(file);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/app’s own texts/);
    expect((await library.getItem('my-poem'))?.source).toBe('official');
  });
});

describe('LibraryService.installTrusted', () => {
  it('validates even trusted packages', async () => {
    const { service } = setup();
    const raw = makeRawPackage();
    await expect(
      service.installTrusted({ manifest: raw.manifest as never, content: raw.content as never, alignment: { segments: {} }, audio: raw.audio }, 30),
    ).rejects.toThrow(/Invalid package/);
  });
});

describe('LibraryService library operations', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(async () => {
    ctx = setup();
    await ctx.service.importPackage(file);
    ctx.clock.tick(1000);
    ctx.reader.result = makeRawPackage({ id: 'alpha-poem', title: 'Alpha' });
    await ctx.service.importPackage(file);
  });

  it('lists entries with their practice state, sorted and searched', async () => {
    await ctx.practice.put({ itemId: 'my-poem', lastSegmentId: 'v1a', rangeStartId: 'v1a', rangeEndId: 'v1b', mode: 'range', count: 3, pause: 2, rate: 1, lastPlayedAt: 10 });
    expect((await ctx.service.list('recent')).map((e) => e.item.id)).toEqual(['my-poem', 'alpha-poem']);
    expect((await ctx.service.list('alpha')).map((e) => e.item.id)).toEqual(['alpha-poem', 'my-poem']);
    expect((await ctx.service.list('added')).map((e) => e.item.id)).toEqual(['alpha-poem', 'my-poem']);
    expect((await ctx.service.list('recent', 'alpha')).map((e) => e.item.id)).toEqual(['alpha-poem']);
    expect((await ctx.service.list('recent'))[0]!.practice?.lastPlayedAt).toBe(10);
  });

  it('continueEntry is the most recently practiced text, or undefined', async () => {
    expect(await ctx.service.continueEntry()).toBeUndefined();
    await ctx.practice.put({ itemId: 'alpha-poem', lastSegmentId: 'v1a', rangeStartId: 'v1a', rangeEndId: 'v1b', mode: 'range', count: 3, pause: 2, rate: 1, lastPlayedAt: 99 });
    expect((await ctx.service.continueEntry())?.item.id).toBe('alpha-poem');
  });

  it('structure gives the text\'s segments without touching the audio', async () => {
    const structure = (await ctx.service.structure('my-poem'))!;
    expect(structure.segments.map((s) => s.label)).toEqual(['1A', '1B', '1']);
    expect(structure.sections).toHaveLength(2);
    expect(await ctx.service.structure('nope')).toBeUndefined();
  });

  it('remove deletes the text and its files but keeps practice history', async () => {
    await ctx.practice.put({ itemId: 'my-poem', lastSegmentId: 'v1a', rangeStartId: 'v1a', rangeEndId: 'v1b', mode: 'range', count: 3, pause: 2, rate: 1, lastPlayedAt: 10 });
    await ctx.service.remove('my-poem');
    expect(await ctx.library.getItem('my-poem')).toBeUndefined();
    expect(await ctx.library.getPackage('my-poem')).toBeUndefined();
    expect(await ctx.practice.get('my-poem')).toBeDefined();
  });

  it('exports a package with an overridden id and title, pointing at its own files', async () => {
    const blob = await ctx.service.exportPackage('my-poem', 'my-poem-copy', 'My Poem (copy)');
    expect(blob.type).toBe('application/zip');
    const written = ctx.writer.written[0]!;
    expect(written.manifest).toMatchObject({ contentId: 'my-poem-copy', title: 'My Poem (copy)', audio: 'audio.mp3', content: 'content.json', alignment: 'alignment.json' });
    expect(written.audioName).toBe('audio.mp3');
  });

  it('cannot export a text that is not installed', async () => {
    await expect(ctx.service.exportPackage('nope')).rejects.toThrow(/not installed/);
  });
});
