import type { DownloadService } from '../application';
import type { CatalogItem } from '../domain';

/** Downloads every text in the catalog that is not installed yet. Handy for demos and tests. */
export async function installSamples(downloads: DownloadService): Promise<CatalogItem[]> {
  const added: CatalogItem[] = [];
  for (const item of await downloads.available()) added.push(await downloads.download(item.id));
  return added;
}
