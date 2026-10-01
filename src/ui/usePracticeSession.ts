import { useEffect, useRef, useState } from 'react';
import { PracticeEngine, PracticeProgressRecorder } from '../application';
import type { EngineSnapshot, OpenedItem } from '../application';
import type { AppServices } from '../app/container';

export interface PracticeSession {
  opened: OpenedItem | null;
  engine: PracticeEngine | null;
  snapshot: EngineSnapshot | null;
  error: string | null;
}

/**
 * Opens a text from the library, wires it to an audio player and a PracticeEngine,
 * and saves progress as you practice. Everything is torn down when the text changes.
 */
export interface SessionCallbacks {
  /** The final save has finished, so lists can show the new progress. */
  onProgressSaved?: () => void;
  /** The browser refused to start playback (it needs a tap first). */
  onBlocked?: () => void;
}

export function usePracticeSession(services: AppServices, itemId: string, callbacks: SessionCallbacks = {}): PracticeSession {
  const latest = useRef(callbacks);
  latest.current = callbacks;
  const [session, setSession] = useState<PracticeSession>({ opened: null, engine: null, snapshot: null, error: null });

  useEffect(() => {
    let cancelled = false;
    let teardown: (() => Promise<void>) | null = null;
    setSession({ opened: null, engine: null, snapshot: null, error: null });

    services.practice
      .open(itemId)
      .then((opened) => {
        if (cancelled) return;
        const url = URL.createObjectURL(opened.audio);
        const audio = services.createAudio();
        const engine = new PracticeEngine(audio, opened.structure.segments);
        engine.restore(opened.setup);
        const recorder = new PracticeProgressRecorder(engine, services.practice, itemId, opened.structure.segments);
        recorder.start();
        engine.subscribe((event) => {
          if (event === 'blocked') latest.current.onBlocked?.();
          setSession((s) => ({ ...s, snapshot: engine.snapshot() }));
        });
        audio.load(url).catch((e: Error) => setSession((s) => ({ ...s, error: e.message })));
        setSession({ opened, engine, snapshot: engine.snapshot(), error: null });

        teardown = async () => {
          engine.pause();
          await recorder.dispose();
          latest.current.onProgressSaved?.();
          engine.dispose();
          audio.destroy();
          URL.revokeObjectURL(url);
        };
      })
      .catch((e: Error) => {
        if (!cancelled) setSession({ opened: null, engine: null, snapshot: null, error: e.message });
      });

    return () => {
      cancelled = true;
      void teardown?.();
    };
  }, [services, itemId]);

  return session;
}
