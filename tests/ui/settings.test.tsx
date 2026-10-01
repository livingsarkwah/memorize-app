// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/domain';
import { mountApp, renderApp, setupApp } from './harness';
import './setup';

describe('Settings', () => {
  it('applies the theme immediately, persists it, and mirrors it for the next first paint', async () => {
    const { user, settingsRepo } = renderApp({}, '#/settings');
    await user.click(await screen.findByRole('button', { name: 'Dark' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(localStorage.getItem('memorize-theme')).toBe('dark');
    await waitFor(() => expect(settingsRepo.stored?.theme).toBe('dark'));
    expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'System' }));
    expect(document.documentElement).not.toHaveAttribute('data-theme');
  });

  it('applies text size as a scale on the page', async () => {
    const { user } = renderApp({}, '#/settings');
    await user.click(await screen.findByRole('button', { name: 'Large' }));
    expect(document.documentElement.style.getPropertyValue('--scale')).toBe('1.2');
    await user.click(screen.getByRole('button', { name: 'Small' }));
    expect(document.documentElement.style.getPropertyValue('--scale')).toBe('0.88');
  });

  it('loads saved settings on start', async () => {
    const ctx = setupApp();
    await ctx.settingsRepo.save({ ...DEFAULT_SETTINGS, theme: 'light', titles: 'native', practiceDefaults: { rate: 1.5, pause: 'auto', count: 7 } });
    mountApp(ctx, '#/settings');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Light' })).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.getByRole('button', { name: 'Original' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('group', { name: 'Default speed' })).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Default speed' })).getByRole('button', { name: '1.5×' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(screen.getByRole('group', { name: 'Default pause' })).getByRole('button', { name: 'Recite' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('toggles translations and changes practice defaults', async () => {
    const { user, settingsRepo } = renderApp({}, '#/settings');
    const toggle = await screen.findByRole('switch', { name: /Show translation/ });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    await user.click(screen.getByRole('button', { name: 'More repeats' }));
    await user.click(within(screen.getByRole('group', { name: 'Default speed' })).getByRole('button', { name: '0.75×' }));
    await waitFor(() => expect(settingsRepo.stored?.practiceDefaults).toMatchObject({ rate: 0.75, count: 4 }));
    expect(settingsRepo.stored?.showTranslation).toBe(true);
  });

  it('stops the repeat stepper at its limits', async () => {
    const { user } = renderApp({}, '#/settings');
    const fewer = await screen.findByRole('button', { name: 'Fewer repeats' });
    for (let i = 0; i < 5; i++) await user.click(fewer);
    expect(fewer).toBeDisabled();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('uses the Titles setting on the Library', async () => {
    const ctx = setupApp();
    await ctx.services.installSamples();
    const { user } = mountApp(ctx, '#/library');
    const row = (await screen.findByText('Tuhfatul Atfaal')).closest('article')!;
    expect(within(row).getByText('تُحْفَةُ الْأَطْفَالِ')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Settings' }));
    await user.click(await screen.findByRole('button', { name: 'English' }));
    await user.click(screen.getByRole('link', { name: 'Library' }));
    const again = (await screen.findByText('Tuhfatul Atfaal')).closest('article')!;
    expect(within(again).queryByText('تُحْفَةُ الْأَطْفَالِ')).not.toBeInTheDocument();
  });

  it('resets everything after confirmation, and only then', async () => {
    const ctx = setupApp();
    await ctx.services.installSamples();
    const { user } = mountApp(ctx, '#/settings');
    await user.click(await screen.findByRole('button', { name: 'Reset all local data' }));
    let dialog = await screen.findByRole('alertdialog', { name: 'Reset all local data?' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(ctx.clearedCount()).toBe(0);

    await user.click(screen.getByRole('button', { name: 'Reset all local data' }));
    dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(ctx.clearedCount()).toBe(1));
    expect(await screen.findByText('Local data was cleared.')).toBeInTheDocument();
    expect(ctx.libraryRepo.items.size).toBe(0);
    expect(location.hash).toBe('#/home');
  });

  it('gets a sample package by downloading the sample first if needed', async () => {
    const { user, libraryRepo } = renderApp({}, '#/settings');
    await user.click(await screen.findByRole('button', { name: /Get a sample package/ }));
    await waitFor(() => expect(libraryRepo.items.has('tuhfatul-atfaal')).toBe(true));
  });
});
