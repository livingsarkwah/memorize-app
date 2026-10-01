import { describe, expect, it } from 'vitest';
import { rowToEntry, SupabaseCatalogIndex } from '../../../src/infrastructure';

const row = {
  id: 'a', version: 1, title: 'A', title_native: 'أ', language: 'ar', content_type: 'poem', author: 'X', reciter: 'Y',
  segment_count: 5, duration: 12.5, published_at: '2026-09-02',
  package_url: 'https://cdn.example/a.zip', package_sha256: 'a'.repeat(64), package_size_bytes: 999,
};

describe('rowToEntry', () => {
  it('maps snake_case database columns to the catalog field names', () => {
    expect(rowToEntry(row)).toEqual({
      id: 'a', version: 1, title: 'A', titleNative: 'أ', language: 'ar', contentType: 'poem', author: 'X', reciter: 'Y',
      segmentCount: 5, duration: 12.5, publishedAt: '2026-09-02',
      package: { url: 'https://cdn.example/a.zip', sha256: 'a'.repeat(64), sizeBytes: 999 },
    });
  });
  it('returns null for a non-object row instead of throwing', () => {
    expect(rowToEntry(null)).toBeNull();
    expect(rowToEntry('x')).toBeNull();
  });
});

describe('SupabaseCatalogIndex', () => {
  it('queries the table with the anon key and parses the rows it gets back', async () => {
    const calls: [string, RequestInit | undefined][] = [];
    const fetchFn = async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      return { ok: true, status: 200, json: async () => [row] } as unknown as Response;
    };
    const index = new SupabaseCatalogIndex({ url: 'https://proj.supabase.co', anonKey: 'anon-key', fetch: fetchFn });
    const entries = await index.load();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.id).toBe('a');
    expect(calls[0]![0]).toBe('https://proj.supabase.co/rest/v1/catalog_items?select=*&order=published_at.desc.nullslast');
    expect(calls[0]![1]).toMatchObject({ cache: 'no-cache', headers: { apikey: 'anon-key', Authorization: 'Bearer anon-key' } });
  });

  it('accepts a trailing slash on the project URL and a custom table name', async () => {
    const calls: string[] = [];
    const fetchFn = async (url: string) => { calls.push(url); return { ok: true, status: 200, json: async () => [] } as unknown as Response; };
    await new SupabaseCatalogIndex({ url: 'https://proj.supabase.co/', anonKey: 'k', table: 'my_texts', fetch: fetchFn }).load();
    expect(calls[0]).toBe('https://proj.supabase.co/rest/v1/my_texts?select=*&order=published_at.desc.nullslast');
  });

  it('drops rows it cannot parse instead of failing the whole catalog', async () => {
    const fetchFn = async () => ({ ok: true, status: 200, json: async () => [row, { id: 'broken' }] } as unknown as Response);
    const entries = await new SupabaseCatalogIndex({ url: 'https://proj.supabase.co', anonKey: 'k', fetch: fetchFn }).load();
    expect(entries.map((e) => e.id)).toEqual(['a']);
  });

  it('reports a clear error for a network failure, a bad status, or a non-array response', async () => {
    const offline = new SupabaseCatalogIndex({ url: 'https://x', anonKey: 'k', fetch: async () => { throw new Error('down'); } });
    await expect(offline.load()).rejects.toThrow(/reach the catalog/);
    const denied = new SupabaseCatalogIndex({ url: 'https://x', anonKey: 'k', fetch: async () => ({ ok: false, status: 401, json: async () => ({}) } as unknown as Response) });
    await expect(denied.load()).rejects.toThrow(/401/);
    const malformed = new SupabaseCatalogIndex({ url: 'https://x', anonKey: 'k', fetch: async () => ({ ok: true, status: 200, json: async () => ({ not: 'an array' }) } as unknown as Response) });
    await expect(malformed.load()).rejects.toThrow(/couldn.t be read/);
  });
});
