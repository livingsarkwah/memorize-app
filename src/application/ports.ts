/**
 * Ports: the small interfaces the application layer needs from the outside
 * world. Infrastructure provides the real implementations (HTMLAudioElement,
 * setTimeout); tests provide fakes.
 */

export interface AudioPort {
  load(src: string): Promise<void>;
  /** May return a promise that rejects when the browser blocks playback. */
  play(): Promise<void> | void;
  pause(): void;
  seek(seconds: number): void;
  setRate(rate: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  /** Called frequently while playing with the current time in seconds. */
  onTick(callback: ((seconds: number) => void) | null): void;
  /** Called when the audio reaches its very end. */
  onEnded(callback: (() => void) | null): void;
  destroy(): void;
}

export interface TimerPort {
  set(callback: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export const systemTimers: TimerPort = {
  set: (callback, ms) => setTimeout(callback, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};
