import type { AvailableItem, CatalogSource, FetchedPackage } from '../../application';
import { flatten } from '../../domain';
import { SAMPLE_ITEMS } from '../../samples';
import { synthesizePlaceholderAudio } from '../audio/placeholderAudio';

const ADDED: Record<string, number> = {
  'tuhfatul-atfaal': Date.parse('2026-09-02'),
  'at-the-cafe': Date.parse('2026-09-08'),
  'a-short-toast': Date.parse('2026-09-14'),
};

export interface SampleCatalogOptions {
  /** Pause between simulated progress steps. Use 0 in tests. */
  stepMs?: number;
  /** How many progress steps a download takes. */
  steps?: number;
}

/**
 * A catalog of the built-in sample texts. Downloads are simulated (the audio is generated
 * on the spot with a short progress animation) so the whole download experience can be
 * built and tested before a real server exists. A remote catalog replaces this class.
 */
export class SampleCatalog implements CatalogSource {
  private readonly stepMs: number;
  private readonly steps: number;

  constructor(options: SampleCatalogOptions = {}) {
    this.stepMs = options.stepMs ?? 140;
    this.steps = options.steps ?? 9;
  }

  async list(): Promise<AvailableItem[]> {
    return SAMPLE_ITEMS.map(({ manifest, content }) => ({
      id: manifest.contentId,
      version: manifest.version,
      title: manifest.title,
      titleNative: manifest.titleNative ?? '',
      language: manifest.language,
      contentType: manifest.contentType ?? 'text',
      author: manifest.author ?? 'Unknown author',
      addedAt: ADDED[manifest.contentId] ?? 0,
      segmentCount: flatten(content).segments.length,
      duration: 0,
    }));
  }

  async fetch(id: string, onProgress: (fraction: number) => void): Promise<FetchedPackage> {
    const sample = SAMPLE_ITEMS.find((s) => s.manifest.contentId === id);
    if (!sample) throw new Error(`“${id}” is not in the catalog.`);

    for (let i = 1; i <= this.steps; i++) {
      if (this.stepMs > 0) await new Promise((r) => setTimeout(r, this.stepMs));
      onProgress(i / this.steps);
    }
    const audio = synthesizePlaceholderAudio(flatten(sample.content).segments, id);
    return {
      package: { manifest: sample.manifest, content: sample.content, alignment: audio.alignment, audio: audio.blob, audioName: 'audio.wav' },
      duration: audio.duration,
      source: 'official',
    };
  }
}
