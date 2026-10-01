import { describe, expect, it } from 'vitest';
import { createAppServices } from '../../src/app/container';
import { PracticeEngine, PracticeProgressRecorder } from '../../src/application';
import { SampleCatalog } from '../../src/infrastructure';
import { SAMPLE_ITEMS } from '../../src/samples';
import { FakeAudio, FakeTimers } from '../helpers/fakes';
import { FakeProbe } from '../helpers/memory';

/**
 * End to end, in Node: real Dexie (fake IndexedDB), real ZIP reading and writing,
 * real validation, real practice engine. Only the audio element and the clock are fakes.
 */
const catalog = () => new SampleCatalog({ stepMs: 0 });
let n = 0;
const fresh = () => createAppServices({ dbName: `container-${++n}-${Math.random().toString(36).slice(2)}`, probe: new FakeProbe(0), catalog: catalog() });
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('app services end to end', () => {
  it('installs the samples once and lists them', async () => {
    const app = fresh();
    expect((await app.installSamples()).map((i) => i.id).sort()).toEqual(SAMPLE_ITEMS.map((s) => s.manifest.contentId).sort());
    expect(await app.installSamples()).toEqual([]);
    const list = await app.library.list('alpha');
    expect(list.map((e) => e.item.title)).toEqual(['A Short Toast', 'At the Café', 'Tuhfatul Atfaal']);
    expect(list.find((e) => e.item.id === 'tuhfatul-atfaal')?.item).toMatchObject({ segmentCount: 17, source: 'official', language: 'ar' });
  });

  it('exports a text as a ZIP and imports it into a completely separate database', async () => {
    const source = fresh();
    await source.installSamples();
    const zip = await source.library.exportPackage('tuhfatul-atfaal', 'tuhfatul-atfaal-copy', 'Tuhfatul Atfaal (copy)');

    const target = fresh();
    const result = await target.library.importPackage(zip);
    expect(result).toMatchObject({ ok: true, replaced: false });
    const opened = await target.practice.open('tuhfatul-atfaal-copy');
    expect(opened.item).toMatchObject({ title: 'Tuhfatul Atfaal (copy)', source: 'imported', segmentCount: 17 });
    expect(opened.structure.segments).toHaveLength(17);
    expect(opened.structure.segments[0]).toMatchObject({ label: '1A', text: SAMPLE_ITEMS[0]!.content.sections[0]!.groups![0]!.segments[0]!.text });
    expect(opened.audio.size).toBeGreaterThan(10_000);
  });

  it('rejects an import that collides with an installed sample', async () => {
    const app = fresh();
    await app.installSamples();
    const zip = await app.library.exportPackage('a-short-toast'); // same contentId as the sample
    const result = await app.library.importPackage(zip);
    expect(result.ok).toBe(false);
  });

  it('rejects a broken ZIP without touching the library', async () => {
    const app = fresh();
    expect(await app.library.importPackage(new Blob(['nope']))).toMatchObject({ ok: false, message: expect.stringMatching(/not a valid ZIP/) });
    expect(await app.library.list()).toEqual([]);
  });

  it('remembers where you were, across a "restart" with the same database', async () => {
    const dbName = `restart-${Math.random().toString(36).slice(2)}`;
    const first = createAppServices({ dbName, probe: new FakeProbe(0), catalog: catalog() });
    await first.installSamples();

    // practice: pick a range in the second verse, speed up, play a little, then leave
    const opened = await first.practice.open('tuhfatul-atfaal');
    const audio = new FakeAudio();
    const timers = new FakeTimers();
    const engine = new PracticeEngine(audio, opened.structure.segments, timers);
    engine.restore(opened.setup);
    const recorder = new PracticeProgressRecorder(engine, first.practice, 'tuhfatul-atfaal', opened.structure.segments, timers);
    recorder.start();
    engine.setRange(2, 5);
    engine.select(3);
    engine.configure({ mode: 'each', count: 4, rate: 0.75, pause: 'auto' });
    engine.play();
    for (let i = 0; i < 20; i++) audio.step(0.01);
    engine.pause();
    await recorder.dispose();
    await settle();

    // a new set of services on the same database, as after reopening the app
    const second = createAppServices({ dbName, probe: new FakeProbe(0), catalog: catalog() });
    const resumed = await second.practice.open('tuhfatul-atfaal');
    expect(resumed.setup).toEqual({ seg: 3, range: [2, 5], mode: 'each', count: 4, pause: 'auto', rate: 0.75 });
    expect((await second.library.continueEntry())?.item.id).toBe('tuhfatul-atfaal');
  });

  it('keeps settings across restarts and applies them as the defaults for new texts', async () => {
    const dbName = `settings-${Math.random().toString(36).slice(2)}`;
    const first = createAppServices({ dbName, probe: new FakeProbe(0), catalog: catalog() });
    await first.settings.update({ theme: 'dark', practiceDefaults: { rate: 0.5, count: 7 } });
    await first.installSamples();

    const second = createAppServices({ dbName, probe: new FakeProbe(0), catalog: catalog() });
    expect((await second.settings.get()).theme).toBe('dark');
    expect((await second.practice.open('a-short-toast')).setup).toMatchObject({ rate: 0.5, count: 7 });
  });

  it('reset clears texts, progress and settings', async () => {
    const app = fresh();
    await app.installSamples();
    await app.settings.update({ theme: 'light' });
    await app.data.clearAll();
    expect(await app.library.list()).toEqual([]);
    expect((await app.settings.get()).theme).toBe('system');
  });

  it('keeps practice history when a text is removed and comes back when it is reinstalled', async () => {
    const app = fresh();
    await app.installSamples();
    const opened = await app.practice.open('a-short-toast');
    await app.practice.saveProgress('a-short-toast', opened.structure.segments, { seg: 2, config: { ...opened.setup, range: [2, 4] } }, true);
    await app.library.remove('a-short-toast');
    await expect(app.practice.open('a-short-toast')).rejects.toThrow(/not installed/);
    await app.installSamples();
    expect((await app.practice.open('a-short-toast')).setup).toMatchObject({ seg: 2, range: [2, 4] });
  });
});
