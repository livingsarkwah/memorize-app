import type { AudioPort, TimerPort } from '../../src/application';
import type { TimedSegment } from '../../src/domain';

/** A fake audio element: time only moves when a test calls step(). */
export class FakeAudio implements AudioPort {
  time = 0;
  rate = 1;
  playing = false;
  /** Audio time at each play() call, after any seek. */
  plays: number[] = [];
  maxTime = 0;
  private tick: ((t: number) => void) | null = null;
  private ended: (() => void) | null = null;

  load(): Promise<void> { return Promise.resolve(); }
  play(): Promise<void> { this.playing = true; this.plays.push(+this.time.toFixed(2)); return Promise.resolve(); }
  pause(): void { this.playing = false; }
  seek(seconds: number): void { this.time = seconds; }
  setRate(rate: number): void { this.rate = rate; }
  getCurrentTime(): number { return this.time; }
  getDuration(): number { return 100; }
  onTick(cb: ((t: number) => void) | null): void { this.tick = cb; }
  onEnded(cb: (() => void) | null): void { this.ended = cb; }
  destroy(): void { this.playing = false; }

  /** Advance real (wall-clock) seconds; audio time advances by dt × rate. */
  step(dt: number): void {
    if (!this.playing) return;
    this.time += dt * this.rate;
    this.maxTime = Math.max(this.maxTime, this.time);
    this.tick?.(this.time);
  }
  fireEnded(): void { this.ended?.(); }
}

/** A fake clock for the engine's pause timers. */
export class FakeTimers implements TimerPort {
  now = 0;
  /** Every delay that was ever scheduled, in ms. */
  delays: number[] = [];
  private nextId = 0;
  private queue: { id: number; at: number; fn: () => void }[] = [];

  set(fn: () => void, ms: number): number {
    this.delays.push(ms);
    const id = ++this.nextId;
    this.queue.push({ id, at: this.now + ms, fn });
    return id;
  }
  clear(handle: unknown): void { this.queue = this.queue.filter((q) => q.id !== handle); }
  advance(ms: number): void {
    const end = this.now + ms;
    for (;;) {
      const due = this.queue.filter((q) => q.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      this.queue = this.queue.filter((q) => q !== due);
      this.now = due.at;
      due.fn();
    }
    this.now = end;
  }
}

/** Four segments with small gaps between them. */
export function makeSegments(): TimedSegment[] {
  const spans: [number, number][] = [[0, 2], [2.2, 4], [4.3, 6], [6.5, 8]];
  return spans.map(([start, end], index) => ({
    id: `s${index}`, index, text: `segment ${index}`, translation: '', speaker: '',
    sectionIndex: 0, groupIndex: -1, position: 0, groupSize: 1, isHeading: false, label: String(index + 1),
    start, end,
  }));
}
