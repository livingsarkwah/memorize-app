/** Static SVG path data (24×24, stroke icons). Trusted constants, never user content. */
const ICONS = {
  home: '<path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z"/>',
  library: '<path d="M5 4v16M10 4v16M15 5.5l4.2 14.2"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  play: '<path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6.5" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="13.5" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/>',
  prev: '<path d="M6 5v14"/><path d="M19 5.5L9 12l10 6.5z" fill="currentColor"/>',
  next: '<path d="M18 5v14"/><path d="M5 5.5L15 12 5 18.5z" fill="currentColor"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  repeat: '<path d="M17 2.5l3.5 3.5L17 9.5"/><path d="M3.5 11V9.5A3.5 3.5 0 0 1 7 6h13.5"/><path d="M7 21.5L3.5 18 7 14.5"/><path d="M20.5 13v1.5A3.5 3.5 0 0 1 17 18H3.5"/>',
  gauge: '<path d="M4 18a8.5 8.5 0 1 1 16 0"/><path d="M12 14l3.5-4.5"/>',
  timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 2M9.5 2.5h5"/>',
  range: '<path d="M8 4H5v16h3M16 4h3v16h-3"/><path d="M10 9h4M10 15h4"/>',
  download: '<path d="M12 4v11m0 0l-4-4m4 4l4-4M5 20h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  import: '<path d="M12 15V4m0 0L8 8m4-4l4 4M5 20h14"/>',
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <span className="ico">
      <svg
        viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: ICONS[name] }}
      />
    </span>
  );
}
