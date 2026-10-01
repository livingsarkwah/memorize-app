#!/usr/bin/env -S npx tsx
/**
 * Turns the zips in content/ into what the app actually serves: validated, content-hashed
 * package files in public/content/, and the catalog.json that lists them.
 *
 * Run this whenever a zip in content/ is added, replaced, or removed, then commit the result
 * in public/content/ along with your change. Deploying is then just the normal `npm run build`
 * — nothing runs this automatically, so a bad zip can never reach production by accident.
 *
 *   npm run build:catalog
 *
 * Each zip must be a package in the same shape the app itself reads on import: manifest.json,
 * content.json, alignment.json and one audio file, at the top level or inside one folder. See
 * src/domain/types.ts (Manifest, ContentDoc, AlignmentDoc) and src/samples for examples, or
 * generate one with the app's own Settings → Developer tools → Get a sample package.
 *
 * Audio length is not checked here (that needs decoding the audio, which this script doesn't
 * do) — only that the file exists and every declared timestamp is internally consistent. Get
 * the length right in alignment.json yourself; the app will still refuse a package whose times
 * don't make sense on their own (unordered, negative, overlapping).
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { flatten, validatePackage } from '../src/domain';
import type { ContentDoc, Manifest } from '../src/domain';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIR = join(ROOT, 'content');
const OUT_DIR = join(ROOT, 'public', 'content');
const CATALOG_PATH = join(OUT_DIR, 'catalog.json');

interface CatalogItemOut {
  id: string;
  version: number | string;
  title: string;
  titleNative: string;
  language: string;
  contentType: string;
  author: string;
  reciter?: string;
  segmentCount: number;
  duration: number;
  publishedAt?: string;
  package: { url: string; sha256: string; sizeBytes: number };
}

class BuildError extends Error {}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Finds a file in the zip by name, case-insensitively, allowing it to sit in one top-level folder. */
function findFile(zip: JSZip, name: string): JSZip.JSZipObject | null {
  const lower = name.toLowerCase();
  for (const path of Object.keys(zip.files)) {
    const file = zip.files[path]!;
    if (file.dir || path.startsWith('__MACOSX')) continue;
    const short = path.toLowerCase();
    if (short === lower || short.endsWith('/' + lower)) return file;
  }
  return null;
}

const AUDIO_EXTENSIONS = ['mp3', 'm4a', 'wav', 'ogg', 'oga', 'opus', 'webm', 'aac'];

async function readPackage(zipPath: string, bytes: Buffer): Promise<{ manifest: Manifest; content: ContentDoc; alignment: unknown; audioBytes: Buffer; audioName: string }> {
  const zip = await JSZip.loadAsync(bytes);
  const manifestFile = findFile(zip, 'manifest.json');
  if (!manifestFile) throw new BuildError('manifest.json was not found.');
  const manifest = JSON.parse(await manifestFile.async('string')) as Manifest;

  const contentFile = findFile(zip, manifest.content ?? 'content.json');
  if (!contentFile) throw new BuildError(`${manifest.content ?? 'content.json'} was not found.`);
  const content = JSON.parse(await contentFile.async('string')) as ContentDoc;

  const alignmentFile = findFile(zip, manifest.alignment ?? 'alignment.json');
  if (!alignmentFile) throw new BuildError(`${manifest.alignment ?? 'alignment.json'} was not found.`);
  const alignment = JSON.parse(await alignmentFile.async('string'));

  const audioName = manifest.audio ?? AUDIO_EXTENSIONS.map((ext) => `audio.${ext}`).find((n) => findFile(zip, n));
  const audioFile = audioName ? findFile(zip, audioName) : null;
  if (!audioFile) throw new BuildError('The audio file named in the manifest (or a file named audio.*) was not found.');

  void zipPath;
  return { manifest, content, alignment, audioBytes: await audioFile.async('nodebuffer'), audioName: basename(audioFile.name) };
}

async function buildOne(fileName: string): Promise<CatalogItemOut> {
  const path = join(SOURCE_DIR, fileName);
  const bytes = readFileSync(path);
  const { manifest, content, alignment } = await readPackage(path, bytes);

  const problems = validatePackage(manifest, content, alignment, 0);
  if (problems.length > 0) {
    throw new BuildError(`${fileName} did not pass validation:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  }
  if (basename(fileName, '.zip') !== manifest.contentId) {
    throw new BuildError(`${fileName} is named differently from its own contentId ("${manifest.contentId}"). Rename the file to match, so it's obvious which is which.`);
  }

  const hash = sha256(bytes);
  const outName = `${manifest.contentId}-${hash.slice(0, 12)}.zip`;
  writeFileSync(join(OUT_DIR, outName), bytes);

  return {
    id: manifest.contentId,
    version: manifest.version,
    title: manifest.title,
    titleNative: manifest.titleNative ?? '',
    language: manifest.language,
    contentType: manifest.contentType ?? 'text',
    author: manifest.author ?? 'Unknown author',
    ...(manifest.reciter ? { reciter: manifest.reciter } : {}),
    segmentCount: flatten(content).segments.length,
    duration: 0,
    ...(manifest.published ? { publishedAt: manifest.published } : {}),
    package: { url: outName, sha256: hash, sizeBytes: bytes.length },
  };
}

async function main(): Promise<void> {
  let zipNames: string[];
  try {
    zipNames = readdirSync(SOURCE_DIR).filter((f) => f.toLowerCase().endsWith('.zip')).sort();
  } catch {
    console.log(`No ${SOURCE_DIR} folder — nothing to build. Create it and add a package zip to publish official content.`);
    return;
  }
  if (zipNames.length === 0) {
    console.log(`${SOURCE_DIR} has no .zip files — nothing to build.`);
    return;
  }

  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const items: CatalogItemOut[] = [];
  const failures: string[] = [];
  const seenIds = new Set<string>();

  for (const fileName of zipNames) {
    try {
      const item = await buildOne(fileName);
      if (seenIds.has(item.id)) throw new BuildError(`contentId "${item.id}" is used by more than one zip in ${basename(SOURCE_DIR)}/.`);
      seenIds.add(item.id);
      items.push(item);
      console.log(`✓ ${fileName} → ${item.package.url} (${item.segmentCount} segments)`);
    } catch (e) {
      failures.push(`✗ ${fileName}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (failures.length > 0) {
    console.error('\n' + failures.join('\n'));
    console.error(`\n${failures.length} of ${zipNames.length} package(s) failed validation. Fixed nothing was written.`);
    rmSync(OUT_DIR, { recursive: true, force: true });
    process.exitCode = 1;
    return;
  }

  writeFileSync(CATALOG_PATH, JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), items }, null, 2) + '\n');
  console.log(`\nWrote ${CATALOG_PATH} with ${items.length} text(s).`);
  console.log('Commit public/content/ along with your change in content/, then deploy as usual.');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
