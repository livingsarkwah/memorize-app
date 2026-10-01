// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AvailableItem, CatalogSource, FetchedPackage } from '../../src/application';
import { CONTENT_REQUEST_EMAIL } from '../../src/app/config';
import { makeRawPackage } from '../helpers/memory';
import { buildRequestMailto } from '../../src/ui/components/RequestContentLink';
import { mountApp, setupApp } from './harness';
import { act } from '@testing-library/react';

/** Simulates the person switching back to this tab, which is when the app rechecks the catalog. */
async function refocusTab(): Promise<void> {
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await Promise.resolve(); });
}
import './setup';

function listing(id: string, extra: Partial<AvailableItem> = {}): AvailableItem {
  return { id, version: 1, title: id, titleNative: '', language: 'en', contentType: 'poem', author: 'A', segmentCount: 3, duration: 30, addedAt: 0, ...extra };
}
function fetched(id: string, sha256: string): FetchedPackage {
  const raw = makeRawPackage({ id, title: id });
  return { package: { manifest: raw.manifest as never, content: raw.content as never, alignment: raw.alignment as never, audio: raw.audio, audioName: 'audio.wav' }, duration: 30, source: 'official', packageHash: sha256 };
}

/** A catalog whose contents this test controls directly, including publish date and package hash. */
function controlledCatalog(items: () => AvailableItem[]): CatalogSource {
  return {
    list: async () => items(),
    fetch: async (id) => {
      const item = items().find((i) => i.id === id)!;
      return fetched(id, item.sha256 ?? 'h1');
    },
  };
}

describe('New label', () => {
  it('marks a text published within the window, and not one published earlier', async () => {
    const now = Date.parse('2026-10-01T00:00:00Z');
    const items = [listing('fresh', { publishedAt: '2026-09-25' }), listing('stale', { publishedAt: '2026-01-01' })];
    const ctx = setupApp({ catalog: controlledCatalog(() => items), clock: undefined });
    // pin Date.now for isNewlyPublished, which reads it directly
    const realNow = Date.now;
    Date.now = () => now;
    mountApp(ctx, '#/library');
    const fresh = (await screen.findByText('fresh')).closest('article')!;
    const stale = (await screen.findByText('stale')).closest('article')!;
    expect(within(fresh).getByText('New')).toBeInTheDocument();
    expect(within(stale).queryByText('New')).not.toBeInTheDocument();
    Date.now = realNow;
  });

  it('never labels an installed text as New', async () => {
    const items = [listing('a', { publishedAt: new Date().toISOString().slice(0, 10) })];
    const ctx = setupApp({ catalog: controlledCatalog(() => items) });
    const { user } = mountApp(ctx, '#/library');
    await user.click((await screen.findByText('a')).closest('article')!.querySelector('button.btn')!);
    await waitFor(() => expect(within((screen.getByText('a')).closest('article')!).getByRole('button', { name: 'Open' })).toBeInTheDocument());
    expect(screen.queryByText('New')).not.toBeInTheDocument();
  });
});

describe('Update available', () => {
  it('offers an update when the published package hash changes, and installing it replaces the text', async () => {
    let items = [listing('a', { sha256: 'h1' })];
    const ctx = setupApp({ catalog: controlledCatalog(() => items) });
    const { user } = mountApp(ctx, '#/library');
    await user.click((await screen.findByText('a')).closest('article')!.querySelector('button.btn')!);
    await waitFor(() => expect(ctx.libraryRepo.items.get('a')).toBeDefined());
    expect(screen.queryByText('Update available')).not.toBeInTheDocument();

    items = [listing('a', { sha256: 'h2' })];
    await refocusTab();
    const row = (await screen.findByText('a')).closest('article')!;
    expect(await within(row).findByText('Update available')).toBeInTheDocument();

    await user.click(within(row).getByRole('button', { name: /Update/ }));
    await waitFor(() => expect(ctx.libraryRepo.getPackage('a').then((p) => p?.manifest)).resolves.toBeDefined());
    await waitFor(() => expect(screen.queryByText('Update available')).not.toBeInTheDocument());
    expect(await screen.findByText('a was updated.')).toBeInTheDocument();
  });

  it('shows an "Updates available" section on Home', async () => {
    let items = [listing('a', { sha256: 'h1' })];
    const ctx = setupApp({ catalog: controlledCatalog(() => items) });
    const { user } = mountApp(ctx, '#/library');
    await user.click((await screen.findByText('a')).closest('article')!.querySelector('button.btn')!);
    await waitFor(() => expect(ctx.libraryRepo.items.get('a')).toBeDefined());

    items = [listing('a', { sha256: 'h2' })];
    await refocusTab();
    await user.click(screen.getByRole('link', { name: 'Home' }));
    expect(await screen.findByRole('heading', { name: 'Updates available' })).toBeInTheDocument();
  });
});

describe('Request a text', () => {
  it('builds a mailto link to the configured address with a prefilled subject and body', () => {
    const href = buildRequestMailto('some poem');
    expect(href.startsWith(`mailto:${CONTENT_REQUEST_EMAIL}?`)).toBe(true);
    expect(href).toContain('subject=Memorize');
    expect(decodeURIComponent(href.split('body=')[1]!)).toContain('some poem');
    expect(href).not.toContain('+'); // spaces must be %20, not '+', for mail client compatibility
  });

  it('appears in the Library, in Settings, and in Search when nothing matches (prefilled with the query)', async () => {
    const ctx = setupApp();
    const { user } = mountApp(ctx, '#/library');
    expect(screen.getByRole('link', { name: 'Request a text' })).toHaveAttribute('href', expect.stringContaining('mailto:'));

    await user.click(screen.getByRole('link', { name: 'Settings' }));
    expect(screen.getByRole('link', { name: 'Request a text' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Search' }));
    await user.type(screen.getByRole('searchbox'), 'some rare poem');
    const link = await screen.findByRole('link', { name: 'Request a text' });
    expect(decodeURIComponent(link.getAttribute('href')!)).toContain('some rare poem');
  });
});
