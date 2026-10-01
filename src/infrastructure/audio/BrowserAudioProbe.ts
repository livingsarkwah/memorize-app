import type { AudioDurationProbe } from '../../application';

/**
 * Finds the length of an audio Blob using the browser's own decoder, which also tells us
 * whether this browser can play it at all (-1 = cannot). Gives up after 8 seconds (0 = unknown).
 */
export class BrowserAudioProbe implements AudioDurationProbe {
  probe(blob: Blob): Promise<number> {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const el = new Audio();
      el.preload = 'metadata';
      const finish = (value: number): void => {
        clearTimeout(timer);
        el.removeAttribute('src');
        URL.revokeObjectURL(url);
        resolve(value);
      };
      const timer = setTimeout(() => finish(0), 8000);
      el.onloadedmetadata = () => finish(Number.isFinite(el.duration) ? el.duration : 0);
      el.onerror = () => finish(-1);
      el.src = url;
    });
  }
}
