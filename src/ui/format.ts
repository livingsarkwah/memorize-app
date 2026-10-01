import type { CatalogItem, TitleMode } from '../domain';
import type { AvailableItem } from '../application';

const RTL_LANGUAGES = ['ar', 'he', 'fa', 'ur'];

/** Text direction for a language code such as "ar" or "he-IL". */
export const directionOf = (language: string): 'rtl' | 'ltr' =>
  RTL_LANGUAGES.includes(language.slice(0, 2).toLowerCase()) ? 'rtl' : 'ltr';

export const capitalize = (s: string): string => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

/** "just now", "12 min ago", "3 h ago", "yesterday", "5 days ago", then a date. */
export function timeAgo(timestamp: number, now: number = Date.now()): string {
  const seconds = Math.max(0, (now - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h ago`;
  if (seconds < 172800) return 'yesterday';
  if (seconds < 604800) return `${Math.round(seconds / 86400)} days ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

const FALLBACK_LANGUAGES: Record<string, string> = { ar: 'Arabic', en: 'English', es: 'Spanish', fr: 'French', ur: 'Urdu' };

/** English name of a language code ("ar" → "Arabic"). Falls back to the upper-cased code. */
export function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code;
  } catch {
    return FALLBACK_LANGUAGES[code] ?? code.toUpperCase();
  }
}

/** "Arabic poem, 17 segments" */
export function typeLine(item: { language: string; contentType: string; segmentCount: number }): string {
  return `${languageName(item.language)} ${item.contentType}, ${item.segmentCount} segments`;
}

/** "1A" for one segment, "1A–2B" for a range. */
export function rangeLabel(segments: readonly { label: string }[], first: number, last: number): string {
  const a = segments[first]?.label ?? '';
  const b = segments[last]?.label ?? '';
  return first === last ? a : `${a}–${b}`;
}

/**
 * Which of a text's two titles to show. 'native' falls back to English when there is no
 * native title, and English is never hidden when it would leave nothing to show.
 */
export function titleParts(english: string, native: string, mode: TitleMode): { english?: string; native?: string } {
  const showNative = !!native && mode !== 'english';
  const showEnglish = !!english && (mode !== 'native' || !native);
  return { english: showEnglish ? english : undefined, native: showNative ? native : undefined };
}

/** Plain-language summary of saved practice settings, for the Continue card. */
export function practiceSummary(p: { mode: string; count: number; rate: number }, rangeText: string, single: boolean, heading: boolean): string {
  const what = single ? (heading ? 'The section title' : `Segment ${rangeText}`) : `Segments ${rangeText.replace('–', ' to ')}`;
  const mode = { segment: 'repeat the segment', range: 'repeat the range', each: 'repeat each segment' }[p.mode] ?? 'repeat the range';
  const times = p.count === 0 ? 'forever' : `${p.count} time${p.count === 1 ? '' : 's'}`;
  return `${what}, ${mode} ${times} at ${p.rate}×`;
}

/** A stable hue (0-359) per text, so each gets its own cover color. Samples keep the prototype's colors. */
export function hueFor(id: string): number {
  const known: Record<string, number> = { 'tuhfatul-atfaal': 172, 'at-the-cafe': 215, 'a-short-toast': 30 };
  if (id in known) return known[id]!;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h % 360;
}

/** A catalog listing shown like an installed text, so both can share one row component. */
export const availableAsItem = (a: AvailableItem): CatalogItem => ({
  id: a.id, version: a.version, title: a.title, titleNative: a.titleNative, language: a.language, contentType: a.contentType,
  author: a.author, ...(a.reciter ? { reciter: a.reciter } : {}), addedAt: a.addedAt, source: 'official', segmentCount: a.segmentCount, duration: a.duration,
});
