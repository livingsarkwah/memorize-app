import { nextCursor, normalizeRange } from '../domain';
import type { Cursor, PauseSetting, PracticeConfig, PracticeSetup, RepeatMode, TimedSegment } from '../domain';
import { systemTimers } from './ports';
import type { AudioPort, TimerPort } from './ports';

export type EngineStatus = 'idle' | 'playing' | 'gap' | 'paused' | 'finished';
export type EngineEvent = 'segment' | 'status' | 'gap' | 'config' | 'blocked';

export interface EngineSnapshot {
  status: EngineStatus;
  /** Segment currently selected / playing. */
  seg: number;
  /** Repetition (or pass) number, 0-based. */
  rep: number;
  /** Length of the current pause, when status is 'gap'. */
  gapMs: number;
  config: PracticeConfig;
}

/** Saved state to load into the engine: config plus where to start. */
export type EngineRestore = PracticeSetup;

/** Fields of the config that can be changed while practicing. */
export type ConfigPatch = Partial<Pick<PracticeConfig, 'mode' | 'count' | 'pause' | 'rate'>>;

type Listener = (event: EngineEvent) => void;

/** How close to a segment's end (seconds) we stop, to absorb polling delay. */
const END_LEAD = 0.03;

/**
 * Owns segment boundaries, repeat logic, pauses and navigation.
 * Knows nothing about the DOM, React, or storage: it talks to an AudioPort
 * and a TimerPort, and reports changes to listeners.
 */
export class PracticeEngine {
  private config: PracticeConfig = { mode: 'range', count: 3, pause: 2, rate: 1, range: [0, 0] };
  private cursor: Cursor = { seg: 0, rep: 0 };
  private status: EngineStatus = 'idle';
  private gapMs = 0;
  private gapHandle: unknown = null;
  private resumable = false;
  private listeners = new Set<Listener>();

  constructor(
    private readonly audio: AudioPort,
    private readonly segments: readonly TimedSegment[],
    private readonly timers: TimerPort = systemTimers,
  ) {
    audio.onTick((t) => this.handleTick(t));
    audio.onEnded(() => this.handleEnded());
  }

  /* ---------- observation ---------- */

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  snapshot(): EngineSnapshot {
    return {
      status: this.status,
      seg: this.cursor.seg,
      rep: this.cursor.rep,
      gapMs: this.gapMs,
      config: { ...this.config, range: [this.config.range[0], this.config.range[1]] },
    };
  }

  private emit(event: EngineEvent): void {
    this.listeners.forEach((l) => l(event));
  }

  /* ---------- configuration ---------- */

  /** Load saved practice state without emitting events or starting playback. */
  restore(state: EngineRestore): void {
    this.config = { mode: state.mode, count: state.count, pause: state.pause, rate: state.rate, range: state.range };
    this.cursor = { seg: state.seg, rep: 0 };
    this.audio.setRate(state.rate);
  }

  configure(patch: ConfigPatch): void {
    let resetRepetition = false;
    if (patch.mode !== undefined && patch.mode !== this.config.mode) {
      this.config.mode = patch.mode as RepeatMode;
      resetRepetition = true;
    }
    if (patch.count !== undefined && patch.count !== this.config.count) {
      this.config.count = patch.count;
      resetRepetition = true;
    }
    if (patch.pause !== undefined) this.config.pause = patch.pause as PauseSetting;
    if (patch.rate !== undefined) {
      this.config.rate = patch.rate;
      this.audio.setRate(patch.rate);
    }
    if (resetRepetition) this.cursor.rep = 0;
    this.emit('config');
  }

  /** Sets the practice range (order-insensitive) and moves to its start. */
  setRange(a: number, b: number): boolean {
    const range = normalizeRange(a, b, this.segments.length);
    if (!range) return false;
    this.config.range = range;
    this.cursor = { seg: range[0], rep: 0 };
    this.afterMove();
    return true;
  }

  /** Jumps to a segment. Moving outside the range narrows the range to that segment. */
  select(i: number): boolean {
    if (!Number.isInteger(i) || i < 0 || i >= this.segments.length) return false;
    const [first, last] = this.config.range;
    if (i < first || i > last) this.config.range = [i, i];
    this.cursor = { seg: i, rep: 0 };
    this.afterMove();
    return true;
  }

  next(): boolean {
    return this.select(this.cursor.seg + 1);
  }

  prev(): boolean {
    return this.select(this.cursor.seg - 1);
  }

  /* ---------- transport ---------- */

  play(): void {
    if (this.status === 'playing' || this.status === 'gap') return;
    if (this.status === 'finished') {
      const start = this.config.mode === 'segment' ? this.cursor.seg : this.config.range[0];
      this.cursor = { seg: start, rep: 0 };
      this.resumable = false;
    }
    if (this.resumable && this.status === 'paused') {
      this.status = 'playing';
      this.emit('status');
      this.startAudio();
      return;
    }
    this.startSegment();
  }

  pause(): void {
    if (this.status === 'playing') {
      this.audio.pause();
      this.resumable = true;
      this.status = 'paused';
    } else if (this.status === 'gap') {
      this.clearGap();
      this.resumable = false;
      this.status = 'paused';
    } else {
      return;
    }
    this.emit('status');
  }

  toggle(): void {
    if (this.status === 'playing' || this.status === 'gap') this.pause();
    else this.play();
  }

  dispose(): void {
    this.clearGap();
    this.audio.onTick(null);
    this.audio.onEnded(null);
    this.listeners.clear();
  }

  /* ---------- internals ---------- */

  private afterMove(): void {
    this.clearGap();
    if (this.status === 'playing' || this.status === 'gap') {
      this.startSegment();
    } else {
      if (this.status === 'finished') this.status = 'idle';
      this.resumable = false;
      this.emit('segment');
    }
  }

  private startAudio(): void {
    const result = this.audio.play();
    if (result && typeof (result as Promise<void>).catch === 'function') {
      (result as Promise<void>).catch(() => {
        this.audio.pause();
        this.status = 'paused';
        this.emit('blocked');
      });
    }
  }

  private startSegment(): void {
    const segment = this.segments[this.cursor.seg]!;
    this.clearGap();
    this.audio.setRate(this.config.rate);
    const t = this.audio.getCurrentTime();
    if (Math.abs(t - segment.start) > 0.05 || t >= segment.end) this.audio.seek(segment.start);
    this.status = 'playing';
    this.resumable = false;
    this.emit('segment');
    this.startAudio();
  }

  private handleTick(t: number): void {
    if (this.status !== 'playing') return;
    if (t >= this.segments[this.cursor.seg]!.end - END_LEAD) this.segmentDone();
  }

  private handleEnded(): void {
    if (this.status !== 'playing') return;
    // Ignore a stale 'ended' event from before we restarted the segment.
    if (this.audio.getCurrentTime() >= this.segments[this.cursor.seg]!.end - 0.1) this.segmentDone();
  }

  private segmentDone(): void {
    this.audio.pause();
    const played = this.segments[this.cursor.seg]!;
    const step = nextCursor(this.config, this.cursor);
    if (!step) {
      this.status = 'finished';
      this.resumable = false;
      this.emit('status');
      return;
    }
    this.cursor = step.cursor;
    if (step.gap) {
      const ms = this.gapDuration(played);
      if (ms > 0) {
        this.status = 'gap';
        this.gapMs = ms;
        this.emit('gap');
        this.gapHandle = this.timers.set(() => {
          this.gapHandle = null;
          if (this.status === 'gap') this.startSegment();
        }, ms);
        return;
      }
    }
    this.startSegment();
  }

  /** Milliseconds of silence to leave after `played`. 'auto' waits as long as the material lasted. */
  private gapDuration(played: TimedSegment): number {
    const { pause, mode, range, rate } = this.config;
    if (pause === 'auto') {
      let seconds = played.end - played.start;
      if (mode === 'range') {
        seconds = 0;
        for (let i = range[0]; i <= range[1]; i++) {
          const s = this.segments[i]!;
          seconds += s.end - s.start;
        }
      }
      return Math.round(Math.min(60_000, Math.max(1_000, (seconds / rate) * 1000)));
    }
    return Math.max(0, Number(pause) || 0) * 1000;
  }

  private clearGap(): void {
    if (this.gapHandle !== null) {
      this.timers.clear(this.gapHandle);
      this.gapHandle = null;
    }
  }
}
