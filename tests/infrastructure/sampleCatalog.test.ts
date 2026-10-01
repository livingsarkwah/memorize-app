import { describe, expect, it } from 'vitest';
import { validatePackage } from '../../src/domain';
import { SampleCatalog } from '../../src/infrastructure';
import { SAMPLE_ITEMS } from '../../src/samples';

describe('SampleCatalog', () => {
  const catalog = new SampleCatalog({ stepMs: 0, steps: 4 });

  it('lists every sample with its segment count', async () => {
    const listed = await catalog.list();
    expect(listed.map((i) => i.id)).toEqual(SAMPLE_ITEMS.map((s) => s.manifest.contentId));
    expect(listed.find((i) => i.id === 'tuhfatul-atfaal')).toMatchObject({ language: 'ar', segmentCount: 17, titleNative: 'تُحْفَةُ الْأَطْفَالِ' });
  });

  it('fetches a valid package and reports steady progress up to 1', async () => {
    const seen: number[] = [];
    const { package: pkg, duration, source } = await catalog.fetch('a-short-toast', (f) => seen.push(f));
    expect(seen).toEqual([0.25, 0.5, 0.75, 1]);
    expect(source).toBe('official');
    expect(validatePackage(pkg.manifest, pkg.content, pkg.alignment, duration)).toEqual([]);
    expect(pkg.audio.size).toBeGreaterThan(1000);
  });

  it('refuses an id that is not in the catalog', async () => {
    await expect(catalog.fetch('nope', () => {})).rejects.toThrow(/not in the catalog/);
  });
});
