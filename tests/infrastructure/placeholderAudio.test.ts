import { describe, expect, it } from 'vitest';
import { flatten, validatePackage } from '../../src/domain';
import { synthesizePlaceholderAudio } from '../../src/infrastructure';
import { SAMPLE_ITEMS } from '../../src/samples';

describe('synthesizePlaceholderAudio', () => {
  for (const item of SAMPLE_ITEMS) {
    it(`produces a valid package for "${item.manifest.title}"`, () => {
      const { segments } = flatten(item.content);
      const audio = synthesizePlaceholderAudio(segments, item.manifest.contentId);
      expect(validatePackage(item.manifest, item.content, audio.alignment, audio.duration)).toEqual([]);
      expect(Object.keys(audio.alignment.segments)).toHaveLength(segments.length);
    });
  }

  it('is deterministic for a given seed and differs between seeds', () => {
    const { segments } = flatten(SAMPLE_ITEMS[2]!.content);
    const a = synthesizePlaceholderAudio(segments, 'one');
    const b = synthesizePlaceholderAudio(segments, 'one');
    const c = synthesizePlaceholderAudio(segments, 'two');
    expect(b.alignment).toEqual(a.alignment);
    expect(c.alignment).not.toEqual(a.alignment);
  });

  it('writes a well-formed WAV whose length matches the reported duration', async () => {
    const { segments } = flatten(SAMPLE_ITEMS[2]!.content);
    const { blob, duration } = synthesizePlaceholderAudio(segments, 'wav');
    const view = new DataView(await blob.arrayBuffer());
    const tag = (o: number) => String.fromCharCode(...[0, 1, 2, 3].map((i) => view.getUint8(o + i)));
    expect(tag(0)).toBe('RIFF');
    expect(tag(8)).toBe('WAVE');
    const sampleRate = view.getUint32(24, true);
    const dataBytes = view.getUint32(40, true);
    expect(dataBytes / 2 / sampleRate).toBeCloseTo(duration, 1);
    expect(blob.type).toBe('audio/wav');
  });
});
