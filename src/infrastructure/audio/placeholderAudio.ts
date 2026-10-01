import type { AlignmentDoc, Segment } from '../../domain';
import { createRng, hash32 } from './prng';

/** D-based scale (Hz). Each segment gets its own short melody over these notes. */
const SCALE = [293.66, 311.13, 369.99, 392.0, 440.0, 466.16, 554.37, 587.33];
const SAMPLE_RATE = 16_000;

export interface PlaceholderAudio {
  blob: Blob;
  /** Exact start/end of every segment, in the shape of a package's alignment.json. */
  alignment: AlignmentDoc;
  duration: number;
}

interface PlannedSegment {
  id: string;
  start: number;
  end: number;
  notes: { freq: number; seconds: number }[];
}

/**
 * Generates a WAV of distinct tone melodies, one per segment, plus the matching
 * alignment. Used for demos and tests, where a real recording is not available.
 * Melodies are deterministic for a given seed, and each ends on the tonic when the
 * segment closes a verse (or stands alone) and on the fourth otherwise.
 */
export function synthesizePlaceholderAudio(segments: readonly Segment[], seed: string): PlaceholderAudio {
  const plan: PlannedSegment[] = [];
  let t = 0.5;

  segments.forEach((s, i) => {
    const rand = createRng(hash32(`${seed}:${s.id}`));
    const words = Math.max(1, s.text.trim().split(/\s+/).length);
    const noteCount = Math.max(3, Math.min(9, Math.round(words * 1.3)));
    const notes: PlannedSegment['notes'] = [];
    let degree = Math.floor(rand() * 4) + 1;
    for (let k = 0; k < noteCount; k++) {
      const last = k === noteCount - 1;
      if (last) degree = s.isHeading || s.groupSize <= 1 || s.position === s.groupSize - 1 ? 0 : 3;
      else degree = Math.max(0, Math.min(SCALE.length - 1, degree + Math.floor(rand() * 5) - 2));
      notes.push({ freq: SCALE[degree]!, seconds: (0.26 + rand() * 0.14) * (last ? 1.7 : 1) });
    }
    const start = t;
    t += notes.reduce((sum, n) => sum + n.seconds, 0);
    plan.push({ id: s.id, start, end: t, notes });

    const next = segments[i + 1];
    t += !next ? 0.6 : next.sectionIndex !== s.sectionIndex ? 1.0 : next.groupIndex !== s.groupIndex ? 0.7 : 0.4;
  });

  const total = Math.ceil(t * SAMPLE_RATE) + 1;
  const samples = new Float32Array(total);
  for (const p of plan) {
    let offset = p.start;
    for (const note of p.notes) {
      const from = Math.floor(offset * SAMPLE_RATE);
      const length = Math.floor(note.seconds * SAMPLE_RATE);
      const w = (2 * Math.PI * note.freq) / SAMPLE_RATE;
      for (let k = 0; k < length; k++) {
        const x = k / SAMPLE_RATE;
        const envelope =
          Math.min(1, x / 0.02) * Math.exp((-2.6 * x) / note.seconds) * Math.min(1, (length - k) / (SAMPLE_RATE * 0.02));
        samples[from + k]! += envelope * (Math.sin(w * k) + 0.28 * Math.sin(2 * w * k) + 0.08 * Math.sin(3 * w * k));
      }
      offset += note.seconds;
    }
  }

  const alignment: AlignmentDoc = { segments: {} };
  for (const p of plan) {
    alignment.segments[p.id] = { start: Math.round(p.start * 100) / 100, end: Math.round(p.end * 100) / 100 };
  }
  return { blob: encodeWav(samples), alignment, duration: t };
}

/** Normalizes to a safe peak and writes a 16-bit mono PCM WAV. */
function encodeWav(samples: Float32Array): Blob {
  let peak = 0;
  for (const v of samples) peak = Math.max(peak, Math.abs(v));
  const gain = peak ? 0.6 / peak : 1;

  const n = samples.length;
  const view = new DataView(new ArrayBuffer(44 + n * 2));
  const text = (offset: number, s: string): void => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + n * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const x = Math.max(-1, Math.min(1, samples[i]! * gain));
    view.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true);
  }
  return new Blob([view], { type: 'audio/wav' });
}
