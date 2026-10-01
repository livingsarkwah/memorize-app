import { describe, expect, it } from 'vitest';
import { DownloadError, PackageDownloader } from '../../../src/infrastructure';

/** A Response whose body streams a byte array in fixed-size chunks, so progress can be observed. */
function chunkedResponse(bytes: Uint8Array, chunkSize: number, opts: { ok?: boolean; status?: number; contentLength?: number | null } = {}): Response {
  let offset = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) { controller.close(); return; }
      const end = Math.min(offset + chunkSize, bytes.length);
      controller.enqueue(bytes.slice(offset, end));
      offset = end;
    },
  });
  const headers = new Headers();
  if (opts.contentLength !== null) headers.set('content-length', String(opts.contentLength ?? bytes.length));
  return { ok: opts.ok ?? true, status: opts.status ?? 200, headers, body, arrayBuffer: async () => bytes.buffer } as unknown as Response;
}

const bytes = (n: number, seed = 1): Uint8Array => Uint8Array.from({ length: n }, (_, i) => (i * seed) % 256);
async function hashOf(b: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', b as unknown as BufferSource);
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

describe('PackageDownloader', () => {
  it('downloads the exact bytes and reports steadily increasing progress up to 1', async () => {
    const data = bytes(5000);
    const hash = await hashOf(data);
    const seen: number[] = [];
    const downloader = new PackageDownloader(async () => chunkedResponse(data, 800));
    const blob = await downloader.download({ url: 'https://x/y.zip', sha256: hash, sizeBytes: data.length }, (f) => seen.push(f));
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(data);
    expect(blob.type).toBe('application/zip');
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]!);
    expect(seen.at(-1)).toBe(1);
    expect(seen.slice(0, -1).every((f) => f <= 0.99)).toBe(true); // never claims 100% until it actually is
  });

  it('is case-insensitive when comparing the published hash', async () => {
    const data = bytes(100);
    const hash = (await hashOf(data)).toUpperCase();
    const downloader = new PackageDownloader(async () => chunkedResponse(data, 50));
    await expect(downloader.download({ url: 'x', sha256: hash, sizeBytes: 100 }, () => {})).resolves.toBeInstanceOf(Blob);
  });

  it('rejects a download whose bytes don’t match the published hash', async () => {
    const data = bytes(200);
    const downloader = new PackageDownloader(async () => chunkedResponse(data, 64));
    const error = await downloader.download({ url: 'x', sha256: '0'.repeat(64), sizeBytes: 200 }, () => {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DownloadError);
    expect((error as Error).message).toMatch(/damaged/);
  });

  it('grows its buffer correctly when the server does not report a size', async () => {
    const data = bytes(1_200_000, 7); // bigger than the 1 MiB initial guess, forces at least one grow
    const hash = await hashOf(data);
    const downloader = new PackageDownloader(async () => chunkedResponse(data, 100_000, { contentLength: null }));
    const blob = await downloader.download({ url: 'x', sha256: hash }, () => {});
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(data);
  }, 15000);

  it('falls back to arrayBuffer() when the response has no readable stream body', async () => {
    const data = bytes(50);
    const hash = await hashOf(data);
    const response = { ok: true, status: 200, headers: new Headers(), body: null, arrayBuffer: async () => data.buffer } as unknown as Response;
    const seen: number[] = [];
    const blob = await new PackageDownloader(async () => response).download({ url: 'x', sha256: hash }, (f) => seen.push(f));
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(data);
    expect(seen).toEqual([1]);
  });

  it('reports a clear message for a network failure and a bad HTTP status', async () => {
    const offline = new PackageDownloader(async () => { throw new Error('boom'); });
    await expect(offline.download({ url: 'x', sha256: 'a'.repeat(64) }, () => {})).rejects.toThrow(/connection/);

    const notFound = new PackageDownloader(async () => chunkedResponse(new Uint8Array(), 10, { ok: false, status: 404 }));
    const error = await notFound.download({ url: 'x', sha256: 'a'.repeat(64) }, () => {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DownloadError);
    expect((error as Error).message).toMatch(/404/);
  });

  it('still succeeds (skipping the check) where Web Crypto is unavailable', async () => {
    const data = bytes(30);
    const downloader = new PackageDownloader(async () => chunkedResponse(data, 10), async () => null);
    const blob = await downloader.download({ url: 'x', sha256: 'does-not-matter' }, () => {});
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(data);
  });
});
