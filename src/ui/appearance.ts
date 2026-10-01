import type { AppSettings } from '../domain';

const TEXT_SCALE = { s: 0.88, m: 1, l: 1.2 } as const;
/** Read by a tiny script in index.html before the first paint, to avoid a flash of the wrong theme. */
export const THEME_MIRROR_KEY = 'memorize-theme';

/**
 * Applies theme and text size to the page. The theme is also mirrored into localStorage
 * (the one value kept outside Dexie) so the very first paint of the next visit is right.
 */
export function applyAppearance(settings: Pick<AppSettings, 'theme' | 'textSize'>, root: HTMLElement = document.documentElement): void {
  if (settings.theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', settings.theme);
  root.style.setProperty('--scale', String(TEXT_SCALE[settings.textSize]));
  try {
    localStorage.setItem(THEME_MIRROR_KEY, settings.theme);
  } catch {
    /* storage may be unavailable (private mode); the theme still applies for this visit */
  }
}
