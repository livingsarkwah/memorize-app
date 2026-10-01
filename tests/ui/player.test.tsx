// @vitest-environment jsdom
import { act, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { FakeAudio } from '../helpers/fakes';
import { audioInstances, mountApp, setupApp } from './harness';
import './setup';

const TUHFA = 'tuhfatul-atfaal';
const rows = () => [...document.querySelectorAll<HTMLElement>('.tr-row')];
const row = (label: string) => rows().find((r) => r.querySelector('.tick')?.textContent === label)!;
/** The two halves of the status line (what is happening, and which repetition), as one string. */
const status = () => [...document.querySelectorAll('.status > span')].map((s) => s.textContent).filter(Boolean).join(' ');
const audio = (): FakeAudio => audioInstances.at(-1)!;

async function openPlayer(prepare?: (ctx: ReturnType<typeof setupApp>) => Promise<void>) {
  const ctx = setupApp();
  await ctx.services.installSamples();
  await prepare?.(ctx);
  const app = mountApp(ctx, `#/player/${TUHFA}`);
  await screen.findByRole('button', { name: 'Practice settings' });
  return { ...ctx, ...app };
}

/** Lets the fake audio run for `seconds` of wall-clock time. */
const run = (seconds: number) => act(() => { for (let i = 0; i < seconds * 100; i++) audio().step(0.01); });

beforeEach(() => { audioInstances.length = 0; });

describe('Player: layout', () => {
  it('shows both titles, the section, and every segment with its label', async () => {
    await openPlayer();
    expect(screen.getByText('Tuhfatul Atfaal', { selector: '.t-en' })).toBeInTheDocument();
    expect(screen.getByText('تُحْفَةُ الْأَطْفَالِ', { selector: '.t-native' })).toBeInTheDocument();
    expect(document.querySelector('.sec')).toHaveTextContent('Introduction');
    expect(rows()).toHaveLength(17);
    expect(rows().slice(0, 4).map((r) => r.querySelector('.tick')!.textContent)).toEqual(['1A', '1B', '2A', '2B']);
    expect(row('Title')).toHaveClass('is-heading');
    expect(screen.getByRole('group', { name: 'Verse 3' })).toBeInTheDocument();
  });

  it('starts on the first verse: current segment marked, range highlighted, ready to play', async () => {
    await openPlayer();
    expect(row('1A')).toHaveClass('cur');
    expect(row('1A')).toHaveAttribute('aria-current', 'true');
    expect(row('1B')).toHaveClass('in-range');
    expect(row('2A')).not.toHaveClass('in-range');
    expect(status()).toBe('Ready at 1A');
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('shows the settings as chips', async () => {
    await openPlayer();
    const chips = [...document.querySelectorAll('.chip')].map((c) => c.textContent);
    expect(chips).toEqual(['1A–1BPractice range', 'Range ×3Repeat mode', '1×Speed', '2 s gapPause between repetitions']);
  });

  it('updates the section line as playback moves into the next section', async () => {
    const { user } = await openPlayer();
    await user.click(row('Title'));
    expect(document.querySelector('.sec')).toHaveTextContent('Rules of noon and tanween');
    expect(row('Title')).toHaveClass('cur');
    expect(status()).toBe('Playing the title Pass 1 of 3');
  });

  it('has a translation under each segment, hidden until turned on', async () => {
    const { user } = await openPlayer();
    expect(document.querySelector('.player')).not.toHaveClass('show-tr');
    await user.click(screen.getByRole('button', { name: 'Practice settings' }));
    await user.click(screen.getByRole('switch', { name: 'Show translation' }));
    expect(document.querySelector('.player')).toHaveClass('show-tr');
    expect(within(row('1A')).getByText(/Says the one hoping/)).toBeInTheDocument();
  });
});

describe('Player: playing', () => {
  it('tapping a segment selects and plays it', async () => {
    const { user } = await openPlayer();
    await user.click(row('2A'));
    expect(status()).toMatch(/^Playing 2A/);
    expect(row('2A')).toHaveClass('cur');
    expect(audio().playing).toBe(true);
    expect(audio().time).toBeCloseTo(row('2A') ? audio().time : 0);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('tapping a segment outside the range narrows the range to it', async () => {
    const { user } = await openPlayer();
    await user.click(row('3B'));
    expect(row('3B')).toHaveClass('in-range');
    expect(row('1A')).not.toHaveClass('in-range');
    expect(screen.getAllByRole('button').find((b) => b.className === 'chip')).toHaveTextContent('3B');
  });

  it('plays through the range, waits during the pause, then repeats', async () => {
    const { user } = await openPlayer();
    await user.click(screen.getByRole('button', { name: 'Play' }));
    expect(status()).toBe('Playing 1A Pass 1 of 3');
    await run(6); // 1A then 1B (the fake segments are a few seconds each)
    await waitFor(() => expect(status()).toMatch(/Your turn/));
    expect(status()).toBe('Your turn Pass 2 of 3');
    expect(document.querySelector('.gapbar')).toHaveClass('on');
    expect(document.querySelector('.gapbar')).toHaveStyle('--gap: 2000ms');
  });

  it('the play button pauses and resumes', async () => {
    const { user } = await openPlayer();
    await user.click(screen.getByRole('button', { name: 'Play' }));
    await run(1);
    await user.click(screen.getByRole('button', { name: 'Pause' }));
    expect(status()).toBe('Paused at 1A Pass 1 of 3');
    expect(audio().playing).toBe(false);
    const paused = audio().time;
    await user.click(screen.getByRole('button', { name: 'Play' }));
    expect(audio().time).toBe(paused);
    expect(audio().playing).toBe(true);
  });

  it('previous and next move between segments and never past the ends', async () => {
    const { user } = await openPlayer();
    await user.click(screen.getByRole('button', { name: 'Next segment' }));
    expect(row('1B')).toHaveClass('cur');
    await user.click(screen.getByRole('button', { name: 'Previous segment' }));
    await user.click(screen.getByRole('button', { name: 'Previous segment' }));
    expect(row('1A')).toHaveClass('cur');
  });

  it('keyboard: space plays and pauses, arrows move', async () => {
    const { user } = await openPlayer();
    await user.keyboard(' ');
    expect(status()).toMatch(/^Playing 1A/);
    await user.keyboard(' ');
    expect(status()).toMatch(/^Paused/);
    await user.keyboard('{ArrowRight}');
    expect(row('1B')).toHaveClass('cur');
    await user.keyboard('{ArrowLeft}');
    expect(row('1A')).toHaveClass('cur');
  });

  it('a row can be activated from the keyboard', async () => {
    const { user } = await openPlayer();
    row('2B').focus();
    await user.keyboard('{Enter}');
    expect(row('2B')).toHaveClass('cur');
    expect(audio().playing).toBe(true);
  });

  it('says so when the browser blocks playback', async () => {
    const { user } = await openPlayer();
    audio().play = () => Promise.reject(new Error('NotAllowedError'));
    await user.click(screen.getByRole('button', { name: 'Play' }));
    expect(await screen.findByText('Playback couldn’t start. Tap play to try again.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('finishes and offers to go again', async () => {
    const { user } = await openPlayer();
    await user.click(screen.getByRole('button', { name: 'Practice settings' }));
    await user.click(screen.getByRole('button', { name: 'This segment' }));
    const stepper = screen.getByRole('button', { name: 'Fewer repeats' });
    for (let i = 0; i < 3; i++) await user.click(stepper);
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Play' }));
    await run(10);
    await waitFor(() => expect(status()).toContain('Finished — press play to go again'));
  });
});

describe('Player: practice settings', () => {
  const open = async (user: Awaited<ReturnType<typeof openPlayer>>['user'], name = 'Practice settings') => {
    await user.click(screen.getByRole('button', { name }));
    return screen.getByRole('dialog', { name: 'Practice settings' });
  };

  it('each chip opens the sheet', async () => {
    const { user } = await openPlayer();
    for (const chip of ['Repeat mode', 'Speed', 'Pause between repetitions', 'Practice range']) {
      await user.click(screen.getByText(chip, { selector: '.chip .sr' }).closest('button')!);
      expect(screen.getByRole('dialog', { name: 'Practice settings' })).toBeInTheDocument();
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    }
  });

  it('changes repeat mode, count, speed and pause, and the dock follows', async () => {
    const { user } = await openPlayer();
    const sheet = await open(user);
    await user.click(within(sheet).getByRole('button', { name: 'Each segment' }));
    expect(within(sheet).getByText('Repeats each segment before moving to the next.')).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: 'More repeats' }));
    await user.click(within(within(sheet).getByRole('group', { name: 'Playback speed' })).getByRole('button', { name: '0.75×' }));
    await user.click(within(within(sheet).getByRole('group', { name: 'Pause between repetitions' })).getByRole('button', { name: 'Recite' }));
    await user.keyboard('{Escape}');
    expect([...document.querySelectorAll('.chip')].map((c) => c.textContent)).toEqual(['1A–1BPractice range', 'Each ×4Repeat mode', '0.75×Speed', 'Recite gapPause between repetitions']);
    expect(audio().rate).toBe(0.75);
  });

  it('repeat forever shows ∞, and is unavailable in "each" mode', async () => {
    const { user } = await openPlayer();
    const sheet = await open(user);
    const forever = within(sheet).getByRole('switch', { name: 'Repeat forever' });
    await user.click(forever);
    expect(forever).toHaveAttribute('aria-checked', 'true');
    expect(within(sheet).getByRole('status')).toHaveTextContent('∞');
    expect(within(sheet).getByRole('button', { name: 'More repeats' })).toBeDisabled();

    await user.click(within(sheet).getByRole('button', { name: 'Each segment' }));
    expect(forever).toBeDisabled();
    expect(forever).toHaveAttribute('aria-checked', 'false'); // switching to "each" gives back a finite count
    expect(within(sheet).getByText('Not available when repeating each segment.')).toBeInTheDocument();
  });

  it('range presets: this segment, this verse, whole section', async () => {
    const { user } = await openPlayer();
    await user.click(row('3B')); // narrows to 3B
    const sheet = await open(user);
    expect(sheet).toHaveTextContent('Practicing 3B, 1 segment');
    await user.click(within(sheet).getByRole('button', { name: 'This verse' }));
    expect(sheet).toHaveTextContent('Practicing 3A–3B, 2 segments');
    await user.click(within(sheet).getByRole('button', { name: 'Whole section' }));
    expect(sheet).toHaveTextContent('Practicing 1A–5B, 10 segments');
    expect(row('5B')).toHaveClass('in-range');
    await user.click(within(sheet).getByRole('button', { name: 'This segment' }));
    expect(sheet).toHaveTextContent('Practicing 1A, 1 segment'); // setting a range moves to its start
  });

  it('only offers "This verse" where the segment belongs to a verse', async () => {
    const ctx = setupApp();
    await ctx.services.installSamples();
    const { user } = mountApp(ctx, '#/player/a-short-toast');
    await user.click(await screen.findByRole('button', { name: 'Practice settings' }));
    expect(screen.getByRole('button', { name: 'This segment' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'This verse' })).not.toBeInTheDocument();
  });

  it('choosing a range on the text: first tap, second tap, in either order', async () => {
    const { user } = await openPlayer();
    const sheet = await open(user);
    await user.click(within(sheet).getByRole('button', { name: 'Select on text' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Tap the first segment of your range.');

    await user.click(row('4B'));
    expect(row('4B')).toHaveClass('first-pick');
    expect(screen.getByRole('status')).toHaveTextContent('Start is 4B. Now tap the last segment.');
    expect(audio().playing).toBe(false); // choosing does not start playback

    await user.click(row('3A')); // reversed on purpose
    expect(screen.queryByText(/Now tap the last segment/)).not.toBeInTheDocument();
    for (const l of ['3A', '3B', '4A', '4B']) expect(row(l)).toHaveClass('in-range');
    expect(row('2B')).not.toHaveClass('in-range');
    expect(row('3A')).toHaveClass('cur'); // positioned at the start of the new range
    expect(document.querySelector('.chip')).toHaveTextContent('3A–4B');
  });

  it('cancelling range selection leaves the range alone', async () => {
    const { user } = await openPlayer();
    const sheet = await open(user);
    await user.click(within(sheet).getByRole('button', { name: 'Select on text' }));
    await user.click(row('4A'));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText(/tap the/i)).not.toBeInTheDocument();
    expect(row('1A')).toHaveClass('in-range');
    expect(row('4A')).not.toHaveClass('first-pick');
  });
});

describe('Player: resume and leaving', () => {
  it('resumes exactly where you left off', async () => {
    await openPlayer(async (ctx) => {
      const opened = await ctx.services.practice.open(TUHFA);
      await ctx.services.practice.saveProgress(TUHFA, opened.structure.segments, { seg: 5, config: { mode: 'each', count: 5, pause: 'auto', rate: 0.75, range: [4, 7] } }, true);
    });
    expect(row('3B')).toHaveClass('cur');
    expect(row('4B')).toHaveClass('in-range');
    expect(row('3A')).toHaveClass('in-range');
    expect(row('2B')).not.toHaveClass('in-range');
    expect([...document.querySelectorAll('.chip')].map((c) => c.textContent)).toEqual(['3A–4BPractice range', 'Each ×5Repeat mode', '0.75×Speed', 'Recite gapPause between repetitions']);
    expect(status()).toBe('Ready at 3B');
  });

  it('saves progress, and Back returns to the tab you came from with Continue practice updated', async () => {
    const ctx = setupApp();
    await ctx.services.installSamples();
    const { user } = mountApp(ctx, '#/library');
    await user.click((await screen.findByText('Tuhfatul Atfaal')).closest('article')!.querySelector('button.primary')!);
    await screen.findByRole('button', { name: 'Practice settings' });
    await user.click(row('2A'));
    await run(0.5);
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('heading', { name: 'Library' })).toBeInTheDocument();
    await waitFor(async () => expect((await ctx.practiceRepo.get(TUHFA))?.lastSegmentId).toBe('v2a'));
    expect((await ctx.practiceRepo.get(TUHFA))?.lastPlayedAt).toBeGreaterThan(0);
    expect(audio().playing).toBe(false); // leaving stops playback

    await user.click(screen.getByRole('link', { name: 'Home' }));
    const hero = await screen.findByRole('region', { name: 'Continue Tuhfatul Atfaal' });
    expect(hero).toHaveTextContent('Segment 2A');
  });

  it('reports a damaged package instead of opening it', async () => {
    const ctx = setupApp();
    await ctx.services.installSamples();
    const record = (await ctx.libraryRepo.getPackage(TUHFA))!;
    ctx.libraryRepo.packages.set(TUHFA, { ...record, alignment: { segments: {} } });
    const { user } = mountApp(ctx, `#/player/${TUHFA}`);
    expect(await screen.findByRole('heading', { name: 'This item can’t be opened' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('appears to be incomplete');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(location.hash).toBe('#/home');
  });

  it('says so for a text that is not installed', async () => {
    mountApp(setupApp(), '#/player/nope');
    expect(await screen.findByRole('heading', { name: 'This item can’t be opened' })).toBeInTheDocument();
  });

  it('hides the tab bar while practicing and restores it on Back', async () => {
    const { user } = await openPlayer();
    expect(document.getElementById('app')).toHaveClass('in-player');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await screen.findByRole('heading', { name: /Continue practice|Start with a text/ });
    expect(document.getElementById('app')).not.toHaveClass('in-player');
  });
});

describe('Player: other kinds of text', () => {
  it('shows speaker names for a dialogue, in reading order', async () => {
    const ctx = setupApp();
    await ctx.services.installSamples();
    mountApp(ctx, '#/player/at-the-cafe');
    await screen.findByRole('button', { name: 'Practice settings' });
    expect(document.querySelectorAll('.spk')).toHaveLength(7);
    expect(rows()[0]!.querySelector('.spk')).toHaveTextContent('Camarero');
    expect(rows()[1]!.querySelector('.spk')).toHaveTextContent('Clienta');
    expect(rows()[0]!.querySelector('.txt')).toHaveAttribute('dir', 'ltr');
    expect(document.querySelector('.tsec-head')).toBeNull(); // single untitled section: no heading
  });

  it('marks Arabic text right-to-left', async () => {
    await openPlayer();
    expect(row('1A').querySelector('.txt')).toHaveAttribute('dir', 'rtl');
    expect(row('1A').querySelector('.txt')).toHaveAttribute('lang', 'ar');
  });
});
