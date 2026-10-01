// @vitest-environment jsdom
import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OFFLINE_READY_EVENT, PackageReadError, UPDATE_READY_EVENT } from '../../src/application';
import { FakeReader, makeRawPackage } from '../helpers/memory';
import { mountApp, renderApp, setupApp } from './harness';
import './setup';

const list = () => screen.getAllByRole('article');
const titles = () => list().map((r) => within(r).getAllByText(/./)[0]!.textContent);

describe('app shell', () => {
  it('shows the four tabs and marks the current one', async () => {
    renderApp();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getAllByRole('link').map((l) => l.textContent)).toEqual(['Home', 'Library', 'Search', 'Settings']);
    expect(within(nav).getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    expect(document.title).toBe('Home · Memorize');
  });

  it('navigates between tabs with the hash, updating the title and the current tab', async () => {
    const { user } = renderApp();
    await user.click(screen.getByRole('link', { name: 'Library' }));
    expect(await screen.findByRole('heading', { name: 'Library' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Library' })).toHaveAttribute('aria-current', 'page');
    expect(document.title).toBe('Library · Memorize');
  });
});

describe('offline app shell messages', () => {
  it('says when the app is ready to use offline, then goes away by itself', async () => {
    renderApp();
    await screen.findByRole('heading', { name: 'Start with a text' });
    vi.useFakeTimers();
    act(() => { window.dispatchEvent(new Event(OFFLINE_READY_EVENT)); });
    expect(screen.getByRole('status')).toHaveTextContent('Ready to use offline.');
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('offers an update that stays until you choose, and applies it on request', async () => {
    const { user } = renderApp();
    await screen.findByRole('heading', { name: 'Start with a text' });
    const apply = vi.fn();
    vi.useFakeTimers();
    act(() => { window.dispatchEvent(new CustomEvent(UPDATE_READY_EVENT, { detail: { apply } })); });
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(screen.getByRole('status')).toHaveTextContent('A new version is ready.');
    vi.useRealTimers();
    expect(apply).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Update' }));
    expect(apply).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('Home', () => {
  it('invites you to start when nothing has been practiced', async () => {
    renderApp();
    expect(await screen.findByRole('heading', { name: 'Start with a text' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Browse the library' })).toBeInTheDocument();
  });

  it('offers the samples to download', async () => {
    renderApp();
    const rows = await screen.findAllByRole('article');
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(within(row).getByRole('button', { name: /Download/ })).toBeInTheDocument();
  });

  it('after downloading, offers to open the text', async () => {
    const ctx = setupApp();
    await ctx.services.installSamples();
    mountApp(ctx);
    expect(await screen.findByRole('button', { name: /^Open / })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Available to download' })).not.toBeInTheDocument();
  });

  it('shows Continue practice with the saved segment, range and settings', async () => {
    const ctx = setupApp();
    await ctx.services.installSamples();
    const opened = await ctx.services.practice.open('tuhfatul-atfaal');
    await ctx.services.practice.saveProgress('tuhfatul-atfaal', opened.structure.segments, { seg: 5, config: { mode: 'each', count: 4, pause: 2, rate: 0.75, range: [4, 7] } }, true);
    mountApp(ctx);

    expect(await screen.findByRole('heading', { name: 'Continue practice' })).toBeInTheDocument();
    const hero = screen.getByRole('region', { name: 'Continue Tuhfatul Atfaal' });
    expect(within(hero).getByText('فِي النُّونِ وَالتَّنْوِينِ وَالْمُدُودِ')).toBeInTheDocument();
    expect(hero).toHaveTextContent('Segments 3A to 4B, repeat each segment 4 times at 0.75×');
    expect(hero).toHaveTextContent('Last practiced just now');
    expect(within(hero).getByRole('button', { name: /Continue/ })).toBeInTheDocument();
  });

  it('lists other practiced texts under Recently practiced', async () => {
    const ctx = setupApp();
    await ctx.services.installSamples();
    for (const [id, t] of [['tuhfatul-atfaal', 1000], ['a-short-toast', 2000]] as const) {
      const opened = await ctx.services.practice.open(id);
      ctx.clock.time = t;
      await ctx.services.practice.saveProgress(id, opened.structure.segments, { seg: 0, config: opened.setup }, true);
    }
    mountApp(ctx);
    expect(await screen.findByRole('heading', { name: 'Recently practiced' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Continue A Short Toast' })).toBeInTheDocument(); // most recent leads
    const recent = screen.getAllByRole('article').find((a) => within(a).queryByText('Tuhfatul Atfaal'));
    expect(recent).toHaveTextContent(/Practiced/);
  });
});

describe('Library', () => {
  it('lists installed and available texts, most recently added first when sorted by Newest', async () => {
    const { user } = renderApp({}, '#/library');
    await screen.findAllByRole('article');
    await user.click(screen.getByRole('button', { name: 'Newest' }));
    expect(titles()).toEqual(['A Short Toast', 'At the Café', 'Tuhfatul Atfaal']);
    await user.click(screen.getByRole('button', { name: 'A to Z' }));
    expect(titles()).toEqual(['A Short Toast', 'At the Café', 'Tuhfatul Atfaal']);
    expect(screen.getByRole('button', { name: 'A to Z' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('downloads a text with visible progress, then offers Open and shows a toast', async () => {
    const { user } = renderApp({}, '#/library');
    const row = (await screen.findByText('Tuhfatul Atfaal')).closest('article')!;
    await user.click(within(row).getByRole('button', { name: /Download/ }));
    expect(await screen.findByRole('status')).toHaveTextContent('Tuhfatul Atfaal is ready to practice.');
    await waitFor(() => expect(within(row).getByRole('button', { name: 'Open' })).toBeInTheDocument());
    expect(within(row).getByRole('button', { name: 'Remove from this device' })).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: /Download/ })).not.toBeInTheDocument();
  });

  it('reports a failed download and keeps the text available', async () => {
    const catalog = {
      list: async () => [{ id: 'x', version: 1, title: 'Broken', titleNative: '', language: 'en', contentType: 'poem', author: 'A', addedAt: 1, segmentCount: 2, duration: 0 }],
      fetch: async () => { throw new Error('offline'); },
    };
    const { user } = renderApp({ catalog }, '#/library');
    await user.click(await screen.findByRole('button', { name: /Download/ }));
    expect(await screen.findByRole('status')).toHaveTextContent('The download failed. Check your connection and try again.');
    expect(screen.getByRole('button', { name: /Download/ })).toBeInTheDocument();
  });

  it('asks before removing, and only removes on confirm', async () => {
    const ctx = setupApp();
    await ctx.services.installSamples();
    const { user } = mountApp(ctx, '#/library');

    const row = (await screen.findByText('A Short Toast')).closest('article')!;
    await user.click(within(row).getByRole('button', { name: 'Remove from this device' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Remove A Short Toast?' });
    expect(dialog).toHaveTextContent('You can download it again any time. Your practice history is kept.');

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(await ctx.libraryRepo.getItem('a-short-toast')).toBeDefined();

    await user.click(within(row).getByRole('button', { name: 'Remove from this device' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(ctx.libraryRepo.items.has('a-short-toast')).toBe(false));
    expect(await screen.findByText('A Short Toast was removed from this device.')).toBeInTheDocument();
    // back on the shelf as something to download
    expect(within((await screen.findByText('A Short Toast')).closest('article')!).getByRole('button', { name: /Download/ })).toBeInTheDocument();
  });

  it('imports a package and opens it from the toast', async () => {
    const { user, libraryRepo, container } = renderApp({}, '#/library');
    const input = container.querySelector('input[type=file]') as HTMLInputElement;
    await user.upload(input, new File(['zip'], 'poem.zip', { type: 'application/zip' }));
    expect(await screen.findByRole('status')).toHaveTextContent('My Poem was imported.');
    expect(libraryRepo.items.get('my-poem')).toMatchObject({ source: 'imported', segmentCount: 3 });
    expect(await screen.findByText('My Poem')).toBeInTheDocument();
  });

  it('explains why an import failed, listing the problems', async () => {
    const bad = makeRawPackage({ alignment: { segments: { v1a: { start: 0.5, end: 2 } } } });
    const { user, container } = renderApp({ reader: new FakeReader(bad) }, '#/library');
    await user.upload(container.querySelector('input[type=file]') as HTMLInputElement, new File(['zip'], 'bad.zip'));
    const dialog = await screen.findByRole('alertdialog', { name: 'This package could not be imported' });
    expect(dialog).toHaveTextContent('The package has problems that need fixing before it can be used:');
    expect(within(dialog).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Segment "v1b" has no alignment entry.', 'Segment "x1" has no alignment entry.']);
    await user.click(within(dialog).getAllByRole('button', { name: 'Close' }).at(-1)!);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('shows the reader’s message for an unreadable file', async () => {
    const { user, container } = renderApp({ reader: new FakeReader(new PackageReadError('This file is not a valid ZIP archive.')) }, '#/library');
    await user.upload(container.querySelector('input[type=file]') as HTMLInputElement, new File(['x'], 'x.zip'));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('This file is not a valid ZIP archive.');
  });
});

describe('Search', () => {
  it('filters by title, author and type, and says when nothing matches', async () => {
    const { user } = renderApp({}, '#/search');
    const box = await screen.findByRole('searchbox', { name: 'Search the library' });
    expect(screen.getByText(/Search by title, author, or type/)).toBeInTheDocument();

    await user.type(box, 'tuhfa');
    expect(titles()).toEqual(['Tuhfatul Atfaal']);
    await user.clear(box);
    await user.type(box, 'JAMZURI');
    expect(titles()).toEqual(['Tuhfatul Atfaal']);
    await user.clear(box);
    await user.type(box, 'zzz');
    expect(screen.getByText(/Nothing matches “zzz”/)).toBeInTheDocument();
  });

  it('offers a shortcut button for each content type', async () => {
    const { user } = renderApp({}, '#/search');
    await user.click(await screen.findByRole('button', { name: 'Dialogue' }));
    expect(screen.getByRole('searchbox')).toHaveValue('dialogue');
    expect(titles()).toEqual(['At the Café']);
  });
});
