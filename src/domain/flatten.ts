import type {
  AlignmentDoc,
  ContentDoc,
  ContentStructure,
  GroupInfo,
  SectionInfo,
  Segment,
  SegmentSource,
  TimedSegment,
} from './types';

/**
 * Turns sections → groups → segments into one ordered list of playable segments,
 * with section/group boundaries and short labels (1A, 1B, 2A ...).
 * Defensive on purpose: it is also run on untrusted, not-yet-validated packages.
 */
export function flatten(content: ContentDoc): ContentStructure {
  const segments: Segment[] = [];
  const sections: SectionInfo[] = [];
  const groups: GroupInfo[] = [];
  const sectionDocs = Array.isArray(content?.sections) ? content.sections : [];
  let ungroupedCount = 0;

  const push = (raw: Partial<SegmentSource> | undefined, extra: Partial<Segment>): void => {
    segments.push({
      id: raw?.id as string,
      index: segments.length,
      text: raw?.text as string,
      translation: raw?.translation ?? '',
      speaker: raw?.speaker ?? '',
      sectionIndex: -1,
      groupIndex: -1,
      position: 0,
      groupSize: 1,
      isHeading: false,
      label: '',
      ...extra,
    });
  };

  sectionDocs.forEach((sec, sectionIndex) => {
    const section = sec ?? { id: '' };
    const info: SectionInfo = {
      id: section.id,
      title: section.title ?? '',
      titleNative: section.titleNative ?? '',
      first: segments.length,
      last: segments.length - 1,
      headingIndex: -1,
    };

    if (section.heading?.text) {
      push(section.heading, { sectionIndex, isHeading: true, label: 'Title' });
      info.headingIndex = segments.length - 1;
    }

    (Array.isArray(section.groups) ? section.groups : []).forEach((grp) => {
      const g = grp ?? { id: '', segments: [] };
      const groupIndex = groups.length;
      const list = Array.isArray(g.segments) ? g.segments : [];
      const first = segments.length;
      const number = String(g.label ?? '').match(/\d+/)?.[0] ?? String(groupIndex + 1);
      list.forEach((raw, position) => {
        const suffix = list.length > 1 ? String.fromCharCode(65 + (position % 26)) : '';
        push(raw, { sectionIndex, groupIndex, position, groupSize: list.length, label: number + suffix });
      });
      groups.push({ id: g.id, label: g.label ?? '', first, last: segments.length - 1, sectionIndex });
    });

    (Array.isArray(section.segments) ? section.segments : []).forEach((raw) => {
      ungroupedCount += 1;
      push(raw, { sectionIndex, label: String(ungroupedCount) });
    });

    info.last = segments.length - 1;
    sections.push(info);
  });

  return { segments, sections, groups };
}

/** Attaches start/end times from an alignment document. Throws if any segment is missing one. */
export function applyAlignment(segments: Segment[], alignment: AlignmentDoc): TimedSegment[] {
  return segments.map((s) => {
    const span = alignment.segments[s.id];
    if (!span) throw new Error(`No alignment entry for segment "${s.id}".`);
    return { ...s, start: span.start, end: span.end };
  });
}
