import { describe, expect, it } from 'vitest';
import { DownloadError, JsonCatalogIndex } from '../../../src/infrastructure';

const entry = { id: 'a', version: 1, title: 'A', language: 'en', package: { url: 'a.zip', sha256: 'a'.repeat(64), sizeBytes: 10 } };

function fetchOf(body: unknown, opts: { ok?: boolean; status?: number; asJson?: boolean } = {}) {
  const calls: [string, RequestInit | undefined][] = [];
  const fn = async (url: string, init?: RequestInit) => {
    calls.push([url, init]);
    return {
      ok: opts.ok ?? true,
      status: opts.status ?? 200,
      json: async () => { if (opts.asJson === false) throw new Error('bad json'); return body; },
    } as unknown as Response;
  };
  return { fn, calls };
}

describe('JsonCatalogIndex', () => {
  it('loads and parses a valid catalog, resolving package URLs against the catalog location', async () => {
    const { fn } = fetchOf({ schemaVersion: 1, items: [entry] });
    const index = new JsonCatalogIndex('/content/catalog.json', fn, 'https://app.example/');
    const entries = await index.load();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.package.url).toBe('https://app.example/content/a.zip');
  });

  it('always bypasses the HTTP cache, so a new catalog is never hidden by a stale one', async () => {
    const { fn, calls } = fetchOf({ schemaVersion: 1, items: [] });
    await new JsonCatalogIndex('/content/catalog.json', fn, 'https://app.example/').load();
    expect(calls[0]![1]).toMatchObject({ cache: 'no-cache' });
  });

  it('silently drops rows it cannot parse instead of failing the whole catalog', async () => {
    const { fn } = fetchOf({ schemaVersion: 1, items: [entry, { id: 'broken' }] });
    const entries = await new JsonCatalogIndex('/content/catalog.json', fn).load();
    expect(entries.map((e) => e.id)).toEqual(['a']);
  });

  it('rejects an unreadable schema version, so an old app never misreads a future catalog format', async () => {
    const { fn } = fetchOf({ schemaVersion: 2, items: [] });
    await expect(new JsonCatalogIndex('/c.json', fn).load()).rejects.toThrow(/doesn.t understand/);
  });

  it('rejects a catalog with no items array', async () => {
    const { fn } = fetchOf({ schemaVersion: 1 });
    await expect(new JsonCatalogIndex('/c.json', fn).load()).rejects.toBeInstanceOf(DownloadError);
  });

  it('reports a clear error for a network failure, a bad status, or invalid JSON', async () => {
    await expect(new JsonCatalogIndex('/c.json', async () => { throw new Error('offline'); }).load()).rejects.toThrow(/reach the catalog/);
    const { fn: notFound } = fetchOf(null, { ok: false, status: 404 });
    await expect(new JsonCatalogIndex('/c.json', notFound).load()).rejects.toThrow(/404/);
    const { fn: badJson } = fetchOf(null, { asJson: false });
    await expect(new JsonCatalogIndex('/c.json', badJson).load()).rejects.toThrow(/couldn.t be read/);
  });
});
