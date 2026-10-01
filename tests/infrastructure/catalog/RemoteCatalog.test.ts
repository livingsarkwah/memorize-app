import { describe, expect, it } from 'vitest';
import { validatePackage } from '../../../src/domain';
import { DownloadError, PackageDownloader, RemoteCatalog, ZipPackageReader, ZipPackageWriter } from '../../../src/infrastructure';
import type { CatalogIndex, RemoteCatalogEntry } from '../../../src/application';
import { makeRawPackage } from '../../helpers/memory';

const entry: RemoteCatalogEntry = {
  id: 'my-poem', version: 1, title: 'My Poem', titleNative: '', language: 'en', contentType: 'poem', author: 'Someone', reciter: 'A Reciter',
  segmentCount: 3, duration: 30, publishedAt: '2026-09-02',
  package: { url: 'https://cdn.example/my-poem.zip', sha256: '', sizeBytes: 0 },
};
const indexOf = (entries: RemoteCatalogEntry[]): CatalogIndex => ({ load: async () => entries });

async function realZipFor(id = 'my-poem') {
  const raw = makeRawPackage({ id });
  const zip = await new ZipPackageWriter().write({ manifest: raw.manifest as never, content: raw.content as never, alignment: raw.alignment as never, audio: raw.audio, audioName: raw.audioName });
  const bytes = new Uint8Array(await zip.arrayBuffer());
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource);
  const sha256 = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return { zip, sha256, sizeBytes: bytes.length };
}

describe('RemoteCatalog', () => {
  it('lists the catalog as AvailableItems, carrying the reciter and publish date through', async () => {
    const catalog = new RemoteCatalog(indexOf([entry]), new ZipPackageReader());
    const list = await catalog.list();
    expect(list).toEqual([{
      id: 'my-poem', version: 1, title: 'My Poem', titleNative: '', language: 'en', contentType: 'poem', author: 'Someone', reciter: 'A Reciter',
      segmentCount: 3, duration: 30, addedAt: Date.parse('2026-09-02'), publishedAt: '2026-09-02', sizeBytes: 0, sha256: '',
    }]);
  });

  it('downloads, verifies and unpacks a real package end to end', async () => {
    const { zip, sha256, sizeBytes } = await realZipFor();
    const live = { ...entry, package: { url: 'https://cdn.example/my-poem.zip', sha256, sizeBytes } };
    const downloader = new PackageDownloader(async (url) => {
      expect(url).toBe(live.package.url);
      return { ok: true, status: 200, headers: new Headers(), body: null, arrayBuffer: async () => zip.arrayBuffer() } as unknown as Response;
    });
    const catalog = new RemoteCatalog(indexOf([live]), new ZipPackageReader(), downloader);

    const seen: number[] = [];
    const fetched = await catalog.fetch('my-poem', (f) => seen.push(f));
    expect(fetched.source).toBe('official');
    expect(fetched.packageHash).toBe(sha256);
    expect(fetched.duration).toBe(30);
    expect(fetched.package.manifest.contentId).toBe('my-poem');
    expect(validatePackage(fetched.package.manifest, fetched.package.content, fetched.package.alignment, fetched.duration)).toEqual([]);
    expect(seen.at(-1)).toBe(1);
  });

  it('refuses an id that has left the catalog since it was listed', async () => {
    const catalog = new RemoteCatalog(indexOf([]), new ZipPackageReader());
    await expect(catalog.fetch('gone', () => {})).rejects.toBeInstanceOf(DownloadError);
  });

  it('refuses a download whose contentId does not match what was asked for (a misrouted or swapped file)', async () => {
    const { zip, sha256, sizeBytes } = await realZipFor('actually-a-different-poem');
    const live = { ...entry, package: { url: 'x', sha256, sizeBytes } }; // catalog still calls it "my-poem"
    const downloader = new PackageDownloader(async () => ({ ok: true, status: 200, headers: new Headers(), body: null, arrayBuffer: async () => zip.arrayBuffer() } as unknown as Response));
    const catalog = new RemoteCatalog(indexOf([live]), new ZipPackageReader(), downloader);
    await expect(catalog.fetch('my-poem', () => {})).rejects.toThrow(/not the text/);
  });

  it('passes on a hash mismatch as a clear download error', async () => {
    const { zip } = await realZipFor();
    const live = { ...entry, package: { url: 'x', sha256: '0'.repeat(64), sizeBytes: 10 } };
    const downloader = new PackageDownloader(async () => ({ ok: true, status: 200, headers: new Headers(), body: null, arrayBuffer: async () => zip.arrayBuffer() } as unknown as Response));
    const catalog = new RemoteCatalog(indexOf([live]), new ZipPackageReader(), downloader);
    await expect(catalog.fetch('my-poem', () => {})).rejects.toThrow(/damaged/);
  });
});
