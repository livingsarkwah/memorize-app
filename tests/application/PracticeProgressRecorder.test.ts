import { describe, expect, it } from 'vitest';
import { LibraryService, PracticeEngine, PracticeProgressRecorder, PracticeService, SettingsService } from '../../src/application';
import { FakeAudio, FakeTimers } from '../helpers/fakes';
import {
  FakeProbe, FakeReader, FakeWriter, FixedClock, MemoryLibraryRepository, MemoryPracticeStateRepository, MemorySettingsRepository, makeRawPackage,
} from '../helpers/memory';

async function setup() {
  const library = new MemoryLibraryRepository();
  const practice = new MemoryPracticeStateRepository();
  const clock = new FixedClock(10_000);
  const libraryService = new LibraryService({ library, practice, reader: new FakeReader(makeRawPackage()), writer: new FakeWriter(), probe: new FakeProbe(30), clock });
  await libraryService.importPackage(new Blob());
  const service = new PracticeService(library, practice, new SettingsService(new MemorySettingsRepository()), clock);
  const opened = await service.open('my-poem');

  const audio = new FakeAudio();
  const timers = new FakeTimers();
  const engine = new PracticeEngine(audio, opened.structure.segments, timers);
  engine.restore(opened.setup);
  const recorder = new PracticeProgressRecorder(engine, service, 'my-poem', opened.structure.segments, timers, 400);
  recorder.start();
  return { engine, recorder, practice, timers, audio, clock };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('PracticeProgressRecorder', () => {
  it('saves shortly after a change, once, not on every change', async () => {
    const { engine, practice, timers } = await setup();
    engine.configure({ rate: 1.25 });
    engine.configure({ rate: 1.5 });
    engine.configure({ count: 6 });
    expect(await practice.get('my-poem')).toBeUndefined(); // still debouncing
    timers.advance(399);
    await settle();
    expect(await practice.get('my-poem')).toBeUndefined();
    timers.advance(1);
    await settle();
    expect(await practice.get('my-poem')).toMatchObject({ rate: 1.5, count: 6 });
    expect((await practice.get('my-poem'))?.lastPlayedAt).toBeUndefined(); // settings changes are not practice
  });

  it('marks the text as practiced when playback starts', async () => {
    const { engine, practice, timers } = await setup();
    engine.play();
    timers.advance(400);
    await settle();
    expect((await practice.get('my-poem'))?.lastPlayedAt).toBe(10_000);
  });

  it('saves immediately when playback stops', async () => {
    const { engine, practice, clock, audio } = await setup();
    engine.play();
    for (let i = 0; i < 30; i++) audio.step(0.01);
    clock.tick(5000);
    engine.pause();
    await settle();
    expect((await practice.get('my-poem'))?.lastPlayedAt).toBe(15_000); // no waiting for the debounce
  });

  it('remembers the position and range across a session', async () => {
    const { engine, recorder, practice } = await setup();
    engine.setRange(1, 2);
    engine.select(2);
    await recorder.dispose();
    expect(await practice.get('my-poem')).toMatchObject({ lastSegmentId: 'x1', rangeStartId: 'v1b', rangeEndId: 'x1' });
  });

  it('dispose saves the final state and stops listening', async () => {
    const { engine, recorder, practice } = await setup();
    engine.configure({ pause: 5 });
    await recorder.dispose();
    expect((await practice.get('my-poem'))?.pause).toBe(5);
    engine.configure({ pause: 1 });
    await settle();
    expect((await practice.get('my-poem'))?.pause).toBe(5);
  });
});
