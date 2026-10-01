import type { AudioPort } from '../../application';

/**
 * AudioPort backed by an HTMLAudioElement.
 * `timeupdate` only fires ~4 times a second, which is too coarse for segment
 * boundaries, so while playing we poll `currentTime` every 25 ms.
 */
export class HtmlAudioService implements AudioPort {
  private readonly el = new Audio();
  private tickCallback: ((seconds: number) => void) | null = null;
  private endedCallback: (() => void) | null = null;
  private poll: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.el.preload = 'auto';
    this.el.addEventListener('ended', () => {
      this.stopPolling();
      this.endedCallback?.();
    });
  }

  load(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const el = this.el;
      const cleanup = (): void => {
        el.removeEventListener('loadedmetadata', onLoaded);
        el.removeEventListener('error', onError);
      };
      const onLoaded = (): void => { cleanup(); resolve(); };
      const onError = (): void => { cleanup(); reject(new Error('The audio could not be loaded.')); };
      el.addEventListener('loadedmetadata', onLoaded);
      el.addEventListener('error', onError);
      el.src = src;
      el.load();
    });
  }

  play(): Promise<void> {
    this.startPolling();
    return this.el.play();
  }

  pause(): void {
    this.el.pause();
    this.stopPolling();
  }

  seek(seconds: number): void {
    try {
      this.el.currentTime = seconds;
    } catch {
      /* seeking before metadata is loaded can throw on some browsers */
    }
  }

  setRate(rate: number): void {
    this.el.playbackRate = rate;
    this.el.defaultPlaybackRate = rate;
    this.el.preservesPitch = true; // keep the voice natural when slowed down
  }

  getCurrentTime(): number {
    return this.el.currentTime;
  }

  getDuration(): number {
    return this.el.duration;
  }

  onTick(callback: ((seconds: number) => void) | null): void {
    this.tickCallback = callback;
  }

  onEnded(callback: (() => void) | null): void {
    this.endedCallback = callback;
  }

  destroy(): void {
    this.pause();
    this.tickCallback = null;
    this.endedCallback = null;
    this.el.removeAttribute('src');
    this.el.load();
  }

  private startPolling(): void {
    if (this.poll !== null) return;
    this.poll = setInterval(() => this.tickCallback?.(this.el.currentTime), 25);
  }

  private stopPolling(): void {
    if (this.poll !== null) clearInterval(this.poll);
    this.poll = null;
  }
}
