import { sha256Hex } from './sha256';

export interface DownloadableFile {
  url: string;
  /** Expected SHA-256 (hex). The download is rejected if the bytes don't match. */
  sha256: string;
  /** Exact size in bytes, used for progress when the server doesn't say. */
  sizeBytes?: number;
}

/** A download that failed in a way worth telling the person about. The message is safe to show. */
export class DownloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DownloadError';
  }
}

type FetchLike = (url: string) => Promise<Response>;

/**
 * Downloads one file with progress and checks it against its published hash, so a truncated
 * or stale download can never be installed. Doesn't know about catalogs or ZIPs, which is what
 * lets a database-backed catalog reuse it unchanged.
 */
export class PackageDownloader {
  constructor(
    private readonly fetchFn: FetchLike = (url) => globalThis.fetch(url),
    private readonly hash: (bytes: Uint8Array) => Promise<string | null> = sha256Hex,
  ) {}

  async download(file: DownloadableFile, onProgress: (fraction: number) => void): Promise<Blob> {
    let response: Response;
    try {
      response = await this.fetchFn(file.url);
    } catch {
      throw new DownloadError('The download failed. Check your connection and try again.');
    }
    if (!response.ok) throw new DownloadError(`The download failed (the server answered ${response.status}). Try again in a moment.`);

    const bytes = await this.readAll(response, file.sizeBytes ?? (Number(response.headers.get('content-length')) || 0), onProgress);

    const actual = await this.hash(bytes);
    if (actual !== null && actual !== file.sha256.toLowerCase()) {
      throw new DownloadError('The download was damaged on the way. Please try again.');
    }
    onProgress(1);
    return new Blob([bytes as BlobPart], { type: 'application/zip' });
  }

  private async readAll(response: Response, expected: number, onProgress: (fraction: number) => void): Promise<Uint8Array> {
    if (!response.body) return new Uint8Array(await response.arrayBuffer());
    const reader = response.body.getReader();
    // Room for the whole file up front when we know its size, so a big download isn't held twice.
    let buffer = new Uint8Array(expected > 0 ? expected : 1 << 20);
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (received + value.length > buffer.length) {
        const grown = new Uint8Array(Math.max(buffer.length * 2, received + value.length));
        grown.set(buffer.subarray(0, received));
        buffer = grown;
      }
      buffer.set(value, received);
      received += value.length;
      if (expected > 0) onProgress(Math.min(0.99, received / expected));
    }
    return buffer.subarray(0, received);
  }
}
