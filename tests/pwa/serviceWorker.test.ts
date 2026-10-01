import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { listPrecacheFiles, renderServiceWorker } from '../../pwa/vite-plugin-sw';

const TEMPLATE = readFileSync(join(__dirname, '..', '..', 'pwa', 'sw.js'), 'utf8');

function fakeBuild(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'memorize-build-'));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
}

describe('listPrecacheFiles', () => {
  it('lists the app files but not the service worker, source maps, or duplicate .woff fonts', () => {
    const dir = fakeBuild({
      'index.html': '<html/>', 'sw.js': 'old', 'manifest.webmanifest': '{}',
      'assets/index-AbCd1234.js': 'js', 'assets/index-AbCd1234.js.map': 'map',
      'assets/amiri-latin-400-normal-Aaaaaaaa.woff': 'w1', 'assets/amiri-latin-400-normal-Bbbbbbbb.woff2': 'w2',
      'assets/onlyold-normal-Cccccccc.woff': 'w3',
      'icons/icon-192.png': 'png',
      'content/catalog.json': '{}', 'content/tuhfatul-atfaal-abc123.zip': 'zip bytes',
    });
    expect(listPrecacheFiles(dir).map((f) => f.path)).toEqual([
      'assets/amiri-latin-400-normal-Bbbbbbbb.woff2',
      'assets/index-AbCd1234.js',
      'assets/onlyold-normal-Cccccccc.woff', // no woff2 twin, so it is kept
      'icons/icon-192.png',
      'index.html',
      'manifest.webmanifest',
    ]);
  });

  it('excludes content/ entirely — official packages and catalog.json are fetched on demand, not precached', () => {
    const dir = fakeBuild({
      'index.html': '<html/>',
      'content/catalog.json': '{"items":[]}',
      'content/a-short-toast-abc123.zip': 'zip bytes',
      'content/nested/should-not-matter.zip': 'zip bytes',
    });
    expect(listPrecacheFiles(dir).map((f) => f.path)).toEqual(['index.html']);
  });
});

describe('renderServiceWorker', () => {
  const files = [{ path: 'index.html', hash: 'aaa' }, { path: 'assets/app.js', hash: 'bbb' }];

  it('fills in the version and the file list, leaving nothing unreplaced', () => {
    const sw = renderServiceWorker(TEMPLATE, files);
    expect(sw).not.toContain('__VERSION__');
    expect(sw).not.toContain('__PRECACHE__');
    expect(sw).toMatch(/const VERSION = '[0-9a-f]{10}';/);
    expect(new vm.Script(sw)).toBeDefined(); // it is valid JavaScript
  });

  it('changes the version when a file changes, and keeps it when nothing changed', () => {
    const version = (f: typeof files) => renderServiceWorker(TEMPLATE, f).match(/VERSION = '(\w+)'/)![1];
    expect(version(files)).toBe(version([...files]));
    expect(version([files[0]!, { ...files[1]!, hash: 'changed' }])).not.toBe(version(files));
    expect(version([...files, { path: 'new.css', hash: 'x' }])).not.toBe(version(files));
  });

  it('refuses a template whose placeholders are missing or repeated', () => {
    expect(() => renderServiceWorker('const a = 1;', files)).toThrow(/exactly once/);
    expect(() => renderServiceWorker(TEMPLATE + '\n// __VERSION__', files)).toThrow(/__VERSION__ exactly once \(found 2\)/);
  });
});

/** Runs the real service worker script against a fake browser environment. */
function runWorker(precache: string[] = ['index.html', 'assets/app.js']) {
  const listeners: Record<string, (event: any) => void> = {};
  const stores = new Map<string, Map<string, string>>();
  const fetched: string[] = [];
  let skipped = false;
  let claimed = false;

  const cacheApi = {
    open: async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name)!;
      return {
        addAll: async (urls: string[]) => { for (const u of urls) store.set(u, `cached:${u}`); },
        match: async (request: string | { url: string }) => {
          const url = typeof request === 'string' ? request : request.url;
          return store.get(url.split('?')[0]!);
        },
      };
    },
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
  };

  const self = {
    registration: { scope: 'https://example.test/app/' },
    location: { origin: 'https://example.test' },
    clients: { claim: async () => { claimed = true; } },
    skipWaiting: () => { skipped = true; },
    addEventListener: (type: string, fn: (event: any) => void) => { listeners[type] = fn; },
  };
  const sandbox = { self, caches: cacheApi, URL, fetch: async (r: { url: string }) => { fetched.push(r.url); return `network:${r.url}`; } };
  vm.runInNewContext(renderServiceWorker(TEMPLATE, precache.map((path) => ({ path, hash: path }))), sandbox);

  const waited: Promise<unknown>[] = [];
  const dispatch = (type: string, event: Record<string, unknown> = {}) => {
    listeners[type]!({ waitUntil: (p: Promise<unknown>) => waited.push(p), respondWith: (p: Promise<unknown>) => waited.push(p), ...event });
    return Promise.all(waited);
  };
  const request = (url: string, extra: Record<string, unknown> = {}) => ({ url, method: 'GET', mode: 'cors', ...extra });
  const respond = async (req: unknown) => {
    let result: Promise<unknown> | undefined;
    listeners['fetch']!({ request: req, respondWith: (p: Promise<unknown>) => { result = p; } });
    return result === undefined ? 'passed-through' : await result;
  };
  return { stores, fetched, dispatch, respond, request, state: () => ({ skipped, claimed }) };
}

describe('the service worker script', () => {
  it('caches the whole app on install, resolving paths against its own scope', async () => {
    const w = runWorker();
    await w.dispatch('install');
    const [cache] = [...w.stores.entries()];
    expect(cache![0]).toMatch(/^memorize-[0-9a-f]{10}$/);
    expect([...cache![1].keys()]).toEqual(['https://example.test/app/index.html', 'https://example.test/app/assets/app.js']);
  });

  it('serves the app shell for any page navigation, even to a URL it has never seen', async () => {
    const w = runWorker();
    await w.dispatch('install');
    expect(await w.respond(w.request('https://example.test/app/', { mode: 'navigate' }))).toBe('cached:https://example.test/app/index.html');
    expect(await w.respond(w.request('https://example.test/app/#/player/x', { mode: 'navigate' }))).toBe('cached:https://example.test/app/index.html');
    expect(w.fetched).toEqual([]); // nothing needed the network
  });

  it('serves cached assets without the network, ignoring query strings', async () => {
    const w = runWorker();
    await w.dispatch('install');
    expect(await w.respond(w.request('https://example.test/app/assets/app.js?v=3'))).toBe('cached:https://example.test/app/assets/app.js');
    expect(w.fetched).toEqual([]);
  });

  it('goes to the network for files it did not cache', async () => {
    const w = runWorker();
    await w.dispatch('install');
    expect(await w.respond(w.request('https://example.test/app/other.json'))).toBe('network:https://example.test/app/other.json');
  });

  it('leaves other requests alone: non-GET and other origins', async () => {
    const w = runWorker();
    await w.dispatch('install');
    expect(await w.respond(w.request('https://example.test/app/x', { method: 'POST' }))).toBe('passed-through');
    expect(await w.respond(w.request('https://other.test/font.woff2'))).toBe('passed-through');
  });

  it('on activation deletes old versions only, and takes over open pages', async () => {
    const w = runWorker();
    w.stores.set('memorize-oldversion', new Map());
    w.stores.set('someone-elses-cache', new Map());
    await w.dispatch('install');
    await w.dispatch('activate');
    const names = [...w.stores.keys()];
    expect(names).not.toContain('memorize-oldversion');
    expect(names).toContain('someone-elses-cache');
    expect(names.filter((n) => n.startsWith('memorize-'))).toHaveLength(1);
    expect(w.state().claimed).toBe(true);
  });

  it('waits for permission before replacing the running version', async () => {
    const w = runWorker();
    await w.dispatch('install');
    expect(w.state().skipped).toBe(false); // installing alone does not take over
    await w.dispatch('message', { data: { type: 'SOMETHING_ELSE' } });
    expect(w.state().skipped).toBe(false);
    await w.dispatch('message', { data: { type: 'SKIP_WAITING' } });
    expect(w.state().skipped).toBe(true);
  });
});
