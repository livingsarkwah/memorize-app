import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Keeps the layers honest. Dependencies point inward only:
 *   ui → infrastructure → application → domain
 * (samples are plain data and may depend on domain types only.)
 */
const SRC = join(__dirname, '..', 'src');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

function importsOf(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  // static imports, side-effect imports (import 'x') and dynamic imports (import('x'))
  return [...source.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1]!);
}

/** True if an import specifier points at the named folder (…/name or …/name/…) or package (name, name/…). */
const pointsAt = (spec: string, name: string): boolean => spec.split('/').includes(name);

function assertNoImports(layer: string, forbidden: string[], message: string): void {
  for (const file of files(join(SRC, layer))) {
    const bad = importsOf(file).filter((spec) => forbidden.some((name) => pointsAt(spec, name)));
    expect(bad, `${file.replace(SRC, 'src')}: ${message}`).toEqual([]);
  }
}

describe('layer boundaries', () => {
  it('domain imports nothing but itself', () => {
    for (const file of files(join(SRC, 'domain'))) {
      const bad = importsOf(file).filter((spec) => !spec.startsWith('./'));
      expect(bad, `${file.replace(SRC, 'src')} may only import from ./`).toEqual([]);
    }
  });

  it('application depends on domain only: no infrastructure, app, UI, React or storage libraries', () => {
    assertNoImports('application', ['infrastructure', 'app', 'ui', 'react', 'samples', 'dexie', 'jszip'], 'application must not reach outward');
  });

  it('infrastructure does not depend on the app wiring or the UI', () => {
    assertNoImports('infrastructure', ['app', 'ui', 'react'], 'infrastructure must not import UI or wiring');
  });

  it('samples only depend on domain types', () => {
    assertNoImports('samples', ['application', 'infrastructure', 'app', 'ui', 'react'], 'samples are plain data');
  });

  it('the UI reaches storage and audio only through the services from src/app, never infrastructure directly', () => {
    assertNoImports('ui', ['infrastructure', 'dexie', 'jszip', 'samples'], 'ui must use the services from src/app');
  });

  it('domain and application code do not touch browser globals', () => {
    for (const layer of ['domain', 'application']) {
      for (const file of files(join(SRC, layer))) {
        const source = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
        expect(source, `${file.replace(SRC, 'src')} uses a browser global`).not.toMatch(/\b(window|document|localStorage|indexedDB|navigator|HTMLAudioElement)\b/);
      }
    }
  });

  it('third-party storage libraries are confined to the folders that own them', () => {
    const owners: Record<string, string> = { dexie: 'infrastructure/db', jszip: 'infrastructure/zip' };
    for (const file of files(SRC)) {
      for (const spec of importsOf(file)) {
        const owner = owners[spec];
        if (owner) expect(file.replace(SRC + '/', ''), `${spec} may only be imported under src/${owner}`).toContain(owner);
      }
    }
  });
});
