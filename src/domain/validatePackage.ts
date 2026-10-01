import { flatten } from './flatten';
import type { ContentDoc } from './types';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * The "content compiler" checks from the product spec, run on a package before
 * the app trusts it. All inputs are `unknown` because they come from JSON files.
 * Returns plain-language problems; an empty list means the package is usable.
 *
 * @param duration audio length in seconds (0 or unknown = skip the length check)
 */
export function validatePackage(
  manifest: unknown,
  content: unknown,
  alignment: unknown,
  duration: number,
): string[] {
  const problems: string[] = [];

  if (!isObj(manifest)) return ['The manifest is missing or unreadable.'];
  if (manifest.schemaVersion !== 1) problems.push('Unsupported schemaVersion. This app reads version 1.');
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(String(manifest.contentId ?? ''))) {
    problems.push('contentId must use letters, numbers and hyphens only.');
  }
  if (!String(manifest.title ?? '').trim()) problems.push('The manifest needs a title.');
  if (!(Number(manifest.version) > 0)) problems.push('version must be a positive number.');
  if (!manifest.language) problems.push('The manifest needs a language code such as "ar" or "en".');
  for (const field of ['author', 'reciter', 'titleNative', 'contentType'] as const) {
    if (manifest[field] !== undefined && typeof manifest[field] !== 'string') problems.push(`${field} must be text.`);
  }
  if (manifest.published !== undefined && !(typeof manifest.published === 'string' && /^\d{4}-\d{2}-\d{2}/.test(manifest.published) && Number.isFinite(Date.parse(manifest.published)))) {
    problems.push('published must be a date such as 2026-09-28.');
  }

  if (!isObj(content) || !Array.isArray(content.sections) || content.sections.length === 0) {
    problems.push('content.json has no sections.');
    return problems;
  }

  const seenSections = new Set<unknown>();
  content.sections.forEach((sec: unknown, si: number) => {
    if (!isObj(sec)) {
      problems.push(`Section ${si + 1} is not an object.`);
      return;
    }
    if (!sec.id) problems.push(`Section ${si + 1} needs an id.`);
    else if (seenSections.has(sec.id)) problems.push(`Section id "${String(sec.id)}" is used twice.`);
    else seenSections.add(sec.id);

    const groups: unknown[] = Array.isArray(sec.groups) ? sec.groups : [];
    groups.forEach((g, gi) => {
      if (!isObj(g) || !Array.isArray(g.segments) || g.segments.length === 0) {
        problems.push(`Group ${gi + 1} in section ${si + 1} has no segments.`);
      }
    });
  });

  const segments = flatten(content as unknown as ContentDoc).segments;
  if (segments.length === 0) {
    problems.push('No segments were found in content.json.');
    return problems;
  }

  const seenSegments = new Set<string>();
  for (const s of segments) {
    if (!s.id) problems.push('A segment is missing its id.');
    else if (seenSegments.has(s.id)) problems.push(`Segment id "${s.id}" is used twice.`);
    else seenSegments.add(s.id);
    if (!String(s.text ?? '').trim()) problems.push(`Segment "${s.id || '?'}" has no text.`);
  }

  if (!isObj(alignment) || !isObj(alignment.segments)) {
    problems.push('alignment.json has no "segments" map.');
    return problems;
  }
  const spans: { id: string; start: number; end: number }[] = [];
  for (const s of segments) {
    const a = (alignment.segments as Obj)[s.id];
    if (!isObj(a)) {
      problems.push(`Segment "${s.id}" has no alignment entry.`);
      continue;
    }
    const { start, end } = a;
    if (typeof start !== 'number' || typeof end !== 'number' || !Number.isFinite(start) || !Number.isFinite(end)) {
      problems.push(`Segment "${s.id}" needs numeric start and end times.`);
      continue;
    }
    if (start < 0) problems.push(`Segment "${s.id}" starts before 0 seconds.`);
    if (!(start < end)) problems.push(`Segment "${s.id}" must start before it ends.`);
    if (duration > 0 && end > duration + 0.05) problems.push(`Segment "${s.id}" ends after the audio does.`);
    spans.push({ id: s.id, start, end });
  }

  if (!alignment.allowOverlap) {
    spans.sort((x, y) => x.start - y.start);
    for (let i = 1; i < spans.length; i++) {
      const prev = spans[i - 1]!;
      const cur = spans[i]!;
      if (cur.start < prev.end - 0.01) {
        problems.push(`Segments "${prev.id}" and "${cur.id}" overlap.`);
        break;
      }
    }
  }
  return problems;
}
