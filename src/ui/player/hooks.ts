import { useEffect } from 'react';
import type { PracticeEngine } from '../../application';

/** Space plays/pauses, arrow keys move between segments. Ignored while typing or while a dialog is open. */
export function usePlayerShortcuts(engine: PracticeEngine | null): void {
  useEffect(() => {
    if (!engine) return;
    const onKey = (e: KeyboardEvent): void => {
      if (document.querySelector('.overlay')) return;
      const target = e.target as HTMLElement;
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const interactive = tag === 'BUTTON' || target.getAttribute('role') === 'button' || target.getAttribute('role') === 'switch';
      if (e.code === 'Space' && !interactive) { e.preventDefault(); engine.toggle(); }
      else if (e.key === 'ArrowRight' && !e.altKey && !e.metaKey) engine.next();
      else if (e.key === 'ArrowLeft' && !e.altKey && !e.metaKey) engine.prev();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [engine]);
}

/** Lock-screen and headset controls, where the browser supports the Media Session API. */
export function useMediaSession(engine: PracticeEngine | null, title: string, artist: string, playing: boolean): void {
  useEffect(() => {
    if (!engine || !('mediaSession' in navigator)) return;
    const session = navigator.mediaSession;
    try {
      session.metadata = new MediaMetadata({ title, artist, album: 'Memorize' });
      session.setActionHandler('play', () => engine.play());
      session.setActionHandler('pause', () => engine.pause());
      session.setActionHandler('previoustrack', () => engine.prev());
      session.setActionHandler('nexttrack', () => engine.next());
    } catch {
      /* unsupported action or metadata: the app still works without lock-screen controls */
    }
    return () => {
      try {
        for (const action of ['play', 'pause', 'previoustrack', 'nexttrack'] as const) session.setActionHandler(action, null);
        session.metadata = null;
      } catch { /* ignore */ }
    };
  }, [engine, title, artist]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    try { navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'; } catch { /* ignore */ }
  }, [playing]);
}

export const prefersReducedMotion = (): boolean =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
