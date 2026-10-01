import type { TimedSegment } from '../domain';
import type { PracticeEngine } from './PracticeEngine';
import { systemTimers } from './ports';
import type { TimerPort } from './ports';
import type { PracticeService } from './PracticeService';

/**
 * Saves practice progress while the engine runs: shortly after any change (debounced),
 * immediately when playback stops, and once more on dispose. Marks "last practiced"
 * whenever playback starts or stops.
 */
export class PracticeProgressRecorder {
  private handle: unknown = null;
  private wasPlaying = false;
  private touched = false;
  private unsubscribe: (() => void) | null = null;
  private saving: Promise<void> = Promise.resolve();

  constructor(
    private readonly engine: PracticeEngine,
    private readonly service: PracticeService,
    private readonly itemId: string,
    private readonly segments: readonly TimedSegment[],
    private readonly timers: TimerPort = systemTimers,
    private readonly debounceMs = 400,
  ) {}

  start(): void {
    this.unsubscribe = this.engine.subscribe(() => this.onChange());
  }

  /** Save now and wait for it to finish. */
  flush(): Promise<void> {
    this.cancelTimer();
    const { seg, config } = this.engine.snapshot();
    const touch = this.touched;
    this.touched = false;
    this.saving = this.saving.then(() => this.service.saveProgress(this.itemId, this.segments, { seg, config }, touch));
    return this.saving;
  }

  async dispose(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = null;
    await this.flush();
  }

  private onChange(): void {
    const { status } = this.engine.snapshot();
    const playing = status === 'playing' || status === 'gap';
    const toggled = playing !== this.wasPlaying;
    this.wasPlaying = playing;
    if (toggled) this.touched = true;
    this.cancelTimer();
    if (toggled && !playing) {
      void this.flush(); // stopped: save right away
    } else {
      this.handle = this.timers.set(() => void this.flush(), this.debounceMs);
    }
  }

  private cancelTimer(): void {
    if (this.handle !== null) {
      this.timers.clear(this.handle);
      this.handle = null;
    }
  }
}
