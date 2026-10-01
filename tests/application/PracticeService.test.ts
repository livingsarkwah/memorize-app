import { describe, expect, it } from 'vitest';
import { LibraryService, PackageProblemError, PracticeService, SettingsService } from '../../src/application';
import {
  FakeProbe, FakeReader, FakeWriter, FixedClock, MemoryLibraryRepository, MemoryPracticeStateRepository, MemorySettingsRepository, makeRawPackage,
} from '../helpers/memory';

async function setup() {
  const library = new MemoryLibraryRepository();
  const practice = new MemoryPracticeStateRepository();
  const settingsRepo = new MemorySettingsRepository();
  const settings = new SettingsService(settingsRepo);
  const clock = new FixedClock(7_000);
  const libraryService = new LibraryService({ library, practice, reader: new FakeReader(makeRawPackage()), writer: new FakeWriter(), probe: new FakeProbe(30), clock });
  await libraryService.importPackage(new Blob());
  const service = new PracticeService(library, practice, settings, clock);
  return { service, library, practice, settings, clock };
}

describe('PracticeService.open', () => {
  it('opens a new text on its first verse with the default settings', async () => {
    const { service } = await setup();
    const opened = await service.open('my-poem');
    expect(opened.item.title).toBe('My Poem');
    expect(opened.structure.segments.map((s) => [s.id, s.start, s.end])).toEqual([['v1a', 0.5, 2], ['v1b', 2.4, 4], ['x1', 5, 6.5]]);
    expect(opened.setup).toEqual({ seg: 0, range: [0, 1], mode: 'range', count: 3, pause: 2, rate: 1 });
    expect(opened.audio).toBeInstanceOf(Blob);
  });

  it('uses the user’s practice defaults for texts not yet practiced', async () => {
    const { service, settings } = await setup();
    await settings.update({ practiceDefaults: { rate: 0.75, pause: 'auto', count: 0 } });
    expect((await service.open('my-poem')).setup).toMatchObject({ rate: 0.75, pause: 'auto', count: 0 });
  });

  it('resumes saved progress', async () => {
    const { service, practice } = await setup();
    await practice.put({ itemId: 'my-poem', lastSegmentId: 'x1', rangeStartId: 'x1', rangeEndId: 'x1', mode: 'segment', count: 7, pause: 3, rate: 1.25, lastPlayedAt: 1 });
    expect((await service.open('my-poem')).setup).toEqual({ seg: 2, range: [2, 2], mode: 'segment', count: 7, pause: 3, rate: 1.25 });
  });

  it('refuses a text that is not installed', async () => {
    const { service } = await setup();
    await expect(service.open('nope')).rejects.toBeInstanceOf(PackageProblemError);
  });

  it('refuses a stored package that has become damaged, instead of handing it to the engine', async () => {
    const { service, library } = await setup();
    const record = (await library.getPackage('my-poem'))!;
    await library.save((await library.getItem('my-poem'))!, { ...record, alignment: { segments: { v1a: { start: 0.5, end: 2 } } } });
    const error = await service.open('my-poem').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PackageProblemError);
    expect((error as PackageProblemError).message).toMatch(/appears to be incomplete/);
    expect((error as PackageProblemError).problems.length).toBeGreaterThan(0);
  });
});

describe('PracticeService.saveProgress', () => {
  const position = { seg: 1, config: { mode: 'range' as const, count: 3, pause: 2 as const, rate: 1, range: [0, 1] as const } };

  it('marks last practiced when asked to touch, and keeps the old time otherwise', async () => {
    const { service, practice, clock } = await setup();
    const { structure } = await service.open('my-poem');

    await service.saveProgress('my-poem', structure.segments, position, false);
    expect((await practice.get('my-poem'))?.lastPlayedAt).toBeUndefined();

    await service.saveProgress('my-poem', structure.segments, position, true);
    expect((await practice.get('my-poem'))?.lastPlayedAt).toBe(7_000);

    clock.tick(60_000);
    await service.saveProgress('my-poem', structure.segments, { ...position, seg: 0 }, false);
    const saved = await practice.get('my-poem');
    expect(saved?.lastPlayedAt).toBe(7_000);
    expect(saved?.lastSegmentId).toBe('v1a');
  });

  it('what is saved is what open() restores', async () => {
    const { service } = await setup();
    const { structure } = await service.open('my-poem');
    await service.saveProgress('my-poem', structure.segments, { seg: 1, config: { mode: 'each', count: 4, pause: 'auto', rate: 0.5, range: [0, 1] } }, true);
    expect((await service.open('my-poem')).setup).toEqual({ seg: 1, range: [0, 1], mode: 'each', count: 4, pause: 'auto', rate: 0.5 });
  });
});
