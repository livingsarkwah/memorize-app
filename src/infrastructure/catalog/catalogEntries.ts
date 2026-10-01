import type { RemoteCatalogEntry } from '../../application';

const isText = (v: unknown): v is string => typeof v === 'string';
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/**
 * Turns one untrusted record (a JSON object or a database row already mapped to camelCase) into a catalog
 * entry, or null if it isn't usable. A catalog that grows beyond what this app understands, or one bad
 * row, should hide that one text, not break the whole list.
 */
export function parseCatalogEntry(raw: unknown, resolveUrl: (url: string) => string): RemoteCatalogEntry | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const pkg = r.package as Record<string, unknown> | undefined;
  if (!isText(r.id) || !r.id || !isText(r.title) || !isText(r.language)) return null;
  if (!(isText(r.version) || typeof r.version === 'number')) return null;
  if (!pkg || !isText(pkg.url) || !isText(pkg.sha256) || !/^[0-9a-f]{64}$/i.test(pkg.sha256) || !isCount(pkg.sizeBytes)) return null;
  return {
    id: r.id,
    version: r.version,
    title: r.title,
    titleNative: isText(r.titleNative) ? r.titleNative : '',
    language: r.language,
    contentType: isText(r.contentType) && r.contentType ? r.contentType : 'text',
    author: isText(r.author) && r.author ? r.author : 'Unknown author',
    ...(isText(r.reciter) && r.reciter ? { reciter: r.reciter } : {}),
    segmentCount: isCount(r.segmentCount) ? r.segmentCount : 0,
    duration: isCount(r.duration) ? r.duration : 0,
    ...(isText(r.publishedAt) && Number.isFinite(Date.parse(r.publishedAt)) ? { publishedAt: r.publishedAt } : {}),
    package: { url: resolveUrl(pkg.url), sha256: pkg.sha256.toLowerCase(), sizeBytes: pkg.sizeBytes },
  };
}
