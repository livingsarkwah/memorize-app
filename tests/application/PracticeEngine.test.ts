import { describe, expect, it } from 'vitest';
import { PracticeEngine } from '../../src/application';
import type { EngineRestore, EngineEvent } from '../../src/application';
import { FakeAudio, FakeTimers, makeSegments } from '../helpers/fakes';

type Setup = Partial<EngineRestore>;

/** Builds an engine on fakes, restores a state, presses play, and runs until it finishes. */
function run(setup: Setup, maxMs = 60_000) {
  const audio = new FakeAudio();
  const timers = new FakeTimers();
  const engine = new PracticeEngine(audio, makeSegments(), timers);
  engine.restore({ mode: 'range', count: 1, pause: 0, rate: 1, seg: 0, range: [0, 0], ...setup });
  engine.play();
  for (let ms = 0; ms < maxMs; ms += 10) {
    audio.step(0.01);
    timers.advance(10);
    if (engine.snapshot().status === 'finished') break;
  }
  return { audio, timers, engine };
}

function idle(setup: Setup = {}) {
  const audio = new FakeAudio();
  const timers = new FakeTimers();
  const engine = new PracticeEngine(audio, makeSegments(), timers);
  engine.restore({ mode: 'range', count: 1, pause: 0, rate: 1, seg: 0, range: [0, 0], ...setup });
  return { audio, timers, engine };
}

describe('PracticeEngine playback', () => {
  it('stops at the end of the segment', () => {
    const r = run({ mode: 'segment', seg: 1, range: [1, 1] });
    expect(r.engine.snapshot().status).toBe('finished');
    expect(r.audio.maxTime).toBeLessThanOrEqual(4.05);
    expect(r.audio.plays).toEqual([2.2]);
  });

  it('seeks back to the segment start for every repetition', () => {
    const r = run({ mode: 'segment', count: 3, seg: 1, range: [1, 1] });
    expect(r.audio.plays).toEqual([2.2, 2.2, 2.2]);
  });

  it('pauses between repetitions, not inside one', () => {
    const r = run({ mode: 'segment', count: 3, pause: 2, range: [0, 0] });
    expect(r.timers.delays).toEqual([2000, 2000]);
  });

  it('range mode plays each segment in order with no pause between them', () => {
    const r = run({ mode: 'range', count: 1, pause: 2, range: [0, 2] });
    expect(r.audio.plays).toEqual([0, 2.2, 4.3]);
    expect(r.timers.delays).toEqual([]);
  });

  it('range mode pauses between passes', () => {
    const r = run({ mode: 'range', count: 2, pause: 1, range: [0, 1] });
    expect(r.timers.delays).toEqual([1000]);
    expect(r.audio.plays).toHaveLength(4);
  });

  it('each mode repeats a segment before advancing', () => {
    const r = run({ mode: 'each', count: 2, range: [0, 1] });
    expect(r.audio.plays).toEqual([0, 0, 2.2, 2.2]);
  });

  it('"recite" pause lasts as long as the segment', () => {
    const r = run({ mode: 'segment', count: 2, pause: 'auto', seg: 1, range: [1, 1] });
    expect(r.timers.delays).toEqual([1800]);
  });

  it('"recite" pause in range mode lasts as long as the whole range', () => {
    const r = run({ mode: 'range', count: 2, pause: 'auto', range: [0, 1] });
    expect(r.timers.delays).toEqual([3800]); // 2.0 + 1.8 seconds
  });

  it('"recite" pause scales with playback speed', () => {
    const r = run({ mode: 'segment', count: 2, pause: 'auto', rate: 0.5, range: [0, 0] });
    expect(r.timers.delays).toEqual([4000]); // 2 s of audio at half speed
  });

  it('keeps going forever when the count is 0', () => {
    const r = run({ mode: 'segment', count: 0, range: [0, 0] }, 20_000);
    expect(r.audio.plays.length).toBeGreaterThan(5);
    expect(r.engine.snapshot().status).not.toBe('finished');
  });

  it('ignores a stale "ended" event after it has already restarted', () => {
    const audio = new FakeAudio();
    const engine = new PracticeEngine(audio, makeSegments(), new FakeTimers());
    engine.restore({ mode: 'segment', count: 0, pause: 0, rate: 1, seg: 3, range: [3, 3] });
    engine.play();
    for (let i = 0; i < 160; i++) audio.step(0.01); // reaches segment end → restarts
    const beforeReps = engine.snapshot().rep;
    audio.fireEnded(); // arrives late, while the audio is back at the start
    expect(engine.snapshot().rep).toBe(beforeReps);
  });
});

describe('PracticeEngine navigation and state', () => {
  it('moving outside the range narrows it to that segment', () => {
    const { engine } = idle({ range: [0, 1] });
    engine.select(3);
    const s = engine.snapshot();
    expect(s.config.range).toEqual([3, 3]);
    expect(s.seg).toBe(3);
  });

  it('moving inside the range keeps it', () => {
    const { engine } = idle({ range: [0, 2] });
    engine.next();
    expect(engine.snapshot().config.range).toEqual([0, 2]);
    expect(engine.snapshot().seg).toBe(1);
  });

  it('setRange orders a reversed selection and jumps to its start', () => {
    const { engine } = idle();
    expect(engine.setRange(3, 1)).toBe(true);
    expect(engine.snapshot()).toMatchObject({ seg: 1, config: { range: [1, 3] } });
  });

  it('rejects an invalid range or segment without changing anything', () => {
    const { engine } = idle({ range: [1, 2], seg: 1 });
    const before = engine.snapshot();
    expect(engine.setRange(-1, 2)).toBe(false);
    expect(engine.select(99)).toBe(false);
    expect(engine.select(1.5)).toBe(false);
    expect(engine.snapshot()).toEqual(before);
  });

  it('cannot move before the first or after the last segment', () => {
    const first = idle({ seg: 0, range: [0, 0] }).engine;
    expect(first.prev()).toBe(false);
    const last = idle({ seg: 3, range: [3, 3] }).engine;
    expect(last.next()).toBe(false);
    expect(last.snapshot().seg).toBe(3);
  });

  it('pausing then playing resumes mid-segment, not from the start', () => {
    const { audio, engine } = idle({ mode: 'segment', range: [0, 0] });
    engine.play();
    for (let i = 0; i < 50; i++) audio.step(0.01);
    engine.pause();
    const paused = audio.time;
    engine.play();
    expect(audio.time).toBe(paused);
    expect(engine.snapshot().status).toBe('playing');
  });

  it('pausing during the pause between repetitions cancels it', () => {
    const { audio, timers, engine } = idle({ mode: 'segment', count: 2, pause: 2, range: [0, 0] });
    engine.play();
    for (let i = 0; i < 205; i++) audio.step(0.01);
    expect(engine.snapshot().status).toBe('gap');
    engine.pause();
    timers.advance(5000);
    expect(engine.snapshot().status).toBe('paused');
    expect(audio.plays).toHaveLength(1);
  });

  it('play after finishing starts again from the beginning of the range', () => {
    const r = run({ mode: 'range', count: 1, range: [1, 2] });
    expect(r.engine.snapshot().status).toBe('finished');
    r.engine.play();
    expect(r.engine.snapshot()).toMatchObject({ status: 'playing', seg: 1, rep: 0 });
  });

  it('changing the count resets the repetition number', () => {
    const { engine } = idle({ mode: 'segment', count: 5, range: [0, 0] });
    engine.play();
    expect(engine.snapshot().rep).toBe(0);
    engine.configure({ count: 2 });
    expect(engine.snapshot().rep).toBe(0);
  });

  it('applies speed changes immediately', () => {
    const { audio, engine } = idle();
    engine.configure({ rate: 0.75 });
    expect(audio.rate).toBe(0.75);
    expect(engine.snapshot().config.rate).toBe(0.75);
  });

  it('notifies subscribers and stops after unsubscribe or dispose', () => {
    const { engine } = idle();
    const seen: EngineEvent[] = [];
    const off = engine.subscribe((e) => seen.push(e));
    engine.configure({ rate: 1.25 });
    engine.select(1);
    expect(seen).toEqual(['config', 'segment']);
    off();
    engine.select(2);
    expect(seen).toHaveLength(2);
  });

  it('reports blocked playback and stays paused', async () => {
    const audio = new FakeAudio();
    audio.play = () => Promise.reject(new Error('NotAllowedError'));
    const engine = new PracticeEngine(audio, makeSegments(), new FakeTimers());
    const seen: EngineEvent[] = [];
    engine.subscribe((e) => seen.push(e));
    engine.restore({ mode: 'range', count: 1, pause: 0, rate: 1, seg: 0, range: [0, 0] });
    engine.play();
    await Promise.resolve();
    await Promise.resolve();
    expect(seen).toContain('blocked');
    expect(engine.snapshot().status).toBe('paused');
  });
});
