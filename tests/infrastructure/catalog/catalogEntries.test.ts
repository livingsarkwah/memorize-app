import { describe, expect, it } from 'vitest';
import { parseCatalogEntry } from '../../../src/infrastructure';

const resolve = (u: string) => `https://cdn.example/${u}`;
const good = { id: 'tuhfatul-atfaal', version: 1, title: 'Tuhfatul Atfaal', language: 'ar', package: { url: 'tuhfatul-atfaal.zip', sha256: 'a'.repeat(64), sizeBytes: 12345 } };

describe('parseCatalogEntry', () => {
  it('accepts a minimal valid entry and fills in defaults', () => {
    const e = parseCatalogEntry(good, resolve)!;
    expect(e).toMatchObject({ id: 'tuhfatul-atfaal', titleNative: '', contentType: 'text', author: 'Unknown author', segmentCount: 0, duration: 0 });
    expect(e.package).toEqual({ url: 'https://cdn.example/tuhfatul-atfaal.zip', sha256: 'a'.repeat(64), sizeBytes: 12345 });
    expect('publishedAt' in e).toBe(false);
    expect('reciter' in e).toBe(false);
  });

  it('carries every optional field when present', () => {
    const e = parseCatalogEntry({ ...good, titleNative: 'تُحْفَةُ', contentType: 'poem', author: 'al-Jamzuri', reciter: 'Sheikh A', segmentCount: 17, duration: 210.5, publishedAt: '2026-09-02' }, resolve)!;
    expect(e).toMatchObject({ titleNative: 'تُحْفَةُ', contentType: 'poem', author: 'al-Jamzuri', reciter: 'Sheikh A', segmentCount: 17, duration: 210.5, publishedAt: '2026-09-02' });
  });

  it('lower-cases the hash so comparisons never fail on case alone', () => {
    expect(parseCatalogEntry({ ...good, package: { ...good.package, sha256: 'A'.repeat(64) } }, resolve)!.package.sha256).toBe('a'.repeat(64));
  });

  it('resolves a relative package URL against the catalog, and leaves an absolute one alone', () => {
    expect(parseCatalogEntry(good, resolve)!.package.url).toBe('https://cdn.example/tuhfatul-atfaal.zip');
    const abs = { ...good, package: { ...good.package, url: 'https://other.example/x.zip' } };
    expect(parseCatalogEntry(abs, (u) => new URL(u, 'https://cdn.example/catalog.json').href)!.package.url).toBe('https://other.example/x.zip');
  });

  it('rejects a row missing required fields, without throwing', () => {
    for (const bad of [
      null, undefined, 'x', 42, [],
      { ...good, id: '' }, { ...good, id: undefined },
      { ...good, title: undefined }, { ...good, language: undefined },
      { ...good, version: undefined }, { ...good, version: null },
      { ...good, package: undefined },
      { ...good, package: { ...good.package, sha256: 'not-hex' } },
      { ...good, package: { ...good.package, sha256: 'a'.repeat(63) } },
      { ...good, package: { url: 'x.zip', sha256: 'a'.repeat(64) } }, // missing sizeBytes
      { ...good, package: { ...good.package, sizeBytes: -1 } },
      { ...good, package: { ...good.package, sizeBytes: 'big' } },
    ]) {
      expect(parseCatalogEntry(bad, resolve), JSON.stringify(bad)).toBeNull();
    }
  });

  it('accepts a numeric or a string version', () => {
    expect(parseCatalogEntry({ ...good, version: '1.2.0' }, resolve)?.version).toBe('1.2.0');
    expect(parseCatalogEntry({ ...good, version: 3 }, resolve)?.version).toBe(3);
  });

  it('drops an unreadable publishedAt rather than failing the whole entry', () => {
    const e = parseCatalogEntry({ ...good, publishedAt: 'not a date' }, resolve)!;
    expect(e).not.toBeNull();
    expect('publishedAt' in e).toBe(false);
  });

  it('treats an empty optional string the same as absent', () => {
    const e = parseCatalogEntry({ ...good, author: '', reciter: '' }, resolve)!;
    expect(e.author).toBe('Unknown author');
    expect('reciter' in e).toBe(false);
  });
});
