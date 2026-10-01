import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { Plugin } from 'vite';

export interface BuiltFile {
  /** Path relative to the build folder, with forward slashes. */
  path: string;
  hash: string;
}

/**
 * Every file worth caching for the offline app shell: scripts, styles, fonts and icons.
 * Deliberately excludes content/ — the official-text packages and catalog.json — since those
 * can be many megabytes of audio and are downloaded on demand by the app itself (see
 * DownloadService), not eagerly on install. catalog.json is also always re-fetched with
 * `cache: 'no-cache'` at runtime (see JsonCatalogIndex), so precaching it would only risk
 * serving a stale list offline instead of the "can't reach the catalog" message that is
 * otherwise shown, which is more honest.
 */
export function listPrecacheFiles(dir: string): BuiltFile[] {
  const all: BuiltFile[] = [];
  const walk = (folder: string): void => {
    for (const name of readdirSync(folder)) {
      const full = join(folder, name);
      if (statSync(full).isDirectory()) {
        if (relative(dir, full) === 'content') continue;
        walk(full);
        continue;
      }
      all.push({
        path: relative(dir, full).split(sep).join('/'),
        hash: createHash('sha256').update(readFileSync(full)).digest('hex'),
      });
    }
  };
  walk(dir);

  // Vite gives each font file its own content hash (name-Ab12Cd34.woff / name-Ef56Gh78.woff2), so
  // the two formats of one font are recognized by the part of the name before the hash.
  const fontBase = (path: string): string => path.replace(/-[\w-]{8}\.woff2?$/, '');
  const woff2Fonts = new Set(all.filter((f) => f.path.endsWith('.woff2')).map((f) => fontBase(f.path)));
  return all
    .filter((f) => f.path !== 'sw.js' && !f.path.endsWith('.map'))
    // browsers that can run this app all support woff2; the older .woff copies would only add weight
    .filter((f) => !(f.path.endsWith('.woff') && woff2Fonts.has(fontBase(f.path))))
    .sort((a, b) => a.path.localeCompare(b.path));
}

/** Fills the service worker template. The version changes whenever any cached file changes. */
export function renderServiceWorker(template: string, files: readonly BuiltFile[]): string {
  for (const placeholder of ['__VERSION__', '__PRECACHE__']) {
    const count = template.split(placeholder).length - 1;
    if (count !== 1) throw new Error(`The service worker template must contain ${placeholder} exactly once (found ${count}).`);
  }
  const version = createHash('sha256').update(files.map((f) => `${f.path}:${f.hash}`).join('\n')).digest('hex').slice(0, 10);
  return template
    .replace('__VERSION__', () => version)
    .replace('__PRECACHE__', () => JSON.stringify(files.map((f) => f.path), null, 2));
}

/** After a production build, writes dist/sw.js listing everything the build produced. */
export function serviceWorkerPlugin(templatePath: string): Plugin {
  let outDir = '';
  return {
    name: 'memorize-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = join(config.root, config.build.outDir);
    },
    closeBundle() {
      const files = listPrecacheFiles(outDir);
      writeFileSync(join(outDir, 'sw.js'), renderServiceWorker(readFileSync(templatePath, 'utf8'), files));
    },
  };
}
