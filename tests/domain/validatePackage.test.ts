import { describe, expect, it } from 'vitest';
import { validatePackage } from '../../src/domain';

const manifest = { schemaVersion: 1, contentId: 'x', version: 1, title: 'X', language: 'en' };
const content = { sections: [{ id: 's', segments: [{ id: 'a', text: 'one' }, { id: 'b', text: 'two' }] }] };
const alignment = { segments: { a: { start: 0, end: 1 }, b: { start: 1.2, end: 2 } } };

const problems = (m: unknown = manifest, c: unknown = content, a: unknown = alignment, d = 5) => validatePackage(m, c, a, d);

describe('validatePackage', () => {
  it('accepts a valid package', () => expect(problems()).toEqual([]));

  it('rejects a missing alignment entry', () => {
    expect(problems(manifest, content, { segments: { a: { start: 0, end: 1 } } })).toEqual(['Segment "b" has no alignment entry.']);
  });
  it('rejects start after end', () => {
    expect(problems(manifest, content, { segments: { a: { start: 2, end: 1 }, b: alignment.segments.b } })[0]).toMatch(/must start before it ends/);
  });
  it('rejects timestamps beyond the audio', () => {
    expect(problems(manifest, content, alignment, 1.5)[0]).toMatch(/ends after the audio/);
  });
  it('skips the length check when the duration is unknown', () => expect(problems(manifest, content, alignment, 0)).toEqual([]));
  it('rejects negative timestamps', () => {
    expect(problems(manifest, content, { segments: { a: { start: -1, end: 1 }, b: alignment.segments.b } })[0]).toMatch(/before 0 seconds/);
  });
  it('rejects non-numeric timestamps', () => {
    expect(problems(manifest, content, { segments: { a: { start: '0', end: 1 }, b: alignment.segments.b } })[0]).toMatch(/numeric/);
  });
  it('rejects duplicate segment ids', () => {
    const dup = { sections: [{ id: 's', segments: [{ id: 'a', text: 'x' }, { id: 'a', text: 'y' }] }] };
    expect(problems(manifest, dup)[0]).toMatch(/used twice/);
  });
  it('rejects duplicate section ids', () => {
    const dup = { sections: [{ id: 's', segments: [{ id: 'a', text: 'x' }] }, { id: 's', segments: [{ id: 'b', text: 'y' }] }] };
    expect(problems(manifest, dup)[0]).toMatch(/Section id "s" is used twice/);
  });
  it('rejects overlapping segments, unless the alignment allows it', () => {
    const overlap = { segments: { a: { start: 0, end: 1.5 }, b: { start: 1, end: 2 } } };
    expect(problems(manifest, content, overlap)[0]).toMatch(/overlap/);
    expect(problems(manifest, content, { ...overlap, allowOverlap: true })).toEqual([]);
  });
  it('rejects empty text', () => {
    expect(problems(manifest, { sections: [{ id: 's', segments: [{ id: 'a', text: '  ' }] }] }, { segments: { a: { start: 0, end: 1 } } })[0]).toMatch(/has no text/);
  });
  it('rejects a group with no segments', () => {
    expect(problems(manifest, { sections: [{ id: 's', groups: [{ id: 'g', segments: [] }] }] })[0]).toMatch(/Group 1/);
  });
  it('rejects a bad manifest', () => {
    expect(problems({ schemaVersion: 2 }).length).toBeGreaterThan(0);
    expect(problems({ ...manifest, contentId: 'has spaces' })[0]).toMatch(/contentId/);
    expect(problems(null)).toEqual(['The manifest is missing or unreadable.']);
  });
  it('rejects missing or malformed files without throwing', () => {
    expect(problems(manifest, null)).toEqual(['content.json has no sections.']);
    expect(problems(manifest, content, null)).toEqual(['alignment.json has no "segments" map.']);
    expect(problems(manifest, { sections: [null] })[0]).toMatch(/not an object/);
  });
});

describe('validatePackage: optional manifest fields', () => {
  it('accepts a reciter, author and published date', () => {
    expect(problems({ ...manifest, reciter: 'Sheikh A', author: 'B', published: '2026-09-28' })).toEqual([]);
    expect(problems({ ...manifest, published: '2026-09-28T10:00:00Z' })).toEqual([]);
  });
  it('rejects a published value that is not a date', () => {
    expect(problems({ ...manifest, published: 'yesterday' })).toEqual(['published must be a date such as 2026-09-28.']);
    expect(problems({ ...manifest, published: 20260928 })).toEqual(['published must be a date such as 2026-09-28.']);
    expect(problems({ ...manifest, published: '2026-13-45' })).toEqual(['published must be a date such as 2026-09-28.']);
  });
  it('rejects a reciter or author that is not text', () => {
    expect(problems({ ...manifest, reciter: 5 })).toEqual(['reciter must be text.']);
    expect(problems({ ...manifest, author: ['x'] })).toEqual(['author must be text.']);
  });
});
