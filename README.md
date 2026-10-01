# Memorize

A memorization-first audio practice app. Pick a segment, a verse or a range, repeat it at your own
speed with the pauses you choose, and pick up exactly where you left off. It installs like an app,
works with no network once loaded, and keeps everything on the device.

This is **stage 3**, the complete first version: domain rules, practice engine, Dexie storage, package
import/export, all five screens (Home, Library, Search, Settings, Player) and the offline PWA shell.
It uses generated tones as audio and a built-in sample catalog, so it runs without a server or a recording.

## Run it

Requires **Node 22.12 or newer** (Vitest 5 needs it). `nvm use` reads `.nvmrc`.

```bash
npm install
npm run dev        # http://localhost:5173  (no service worker in dev, on purpose)
npm test           # 272 tests, about 15 seconds
npm run typecheck
npm run build      # static site in dist/
npm run preview    # serves dist/ so you can try the offline behaviour
```

Try it: **Library → Download** a text, open it, tap a verse, change the repeat and pause settings, go
back, reload: **Continue practice** on Home resumes it. Then go offline and reload: it still opens.

## What's in it

| Screen | What it does |
|---|---|
| **Home** | *Continue practice* card showing the segment you were on, recently practiced texts, texts to download |
| **Library** | Sort by recent, newest or A to Z. Download with progress, remove (asks first), import a `.zip` |
| **Search** | Title, native title, author, type or language, with type shortcuts |
| **Settings** | Theme, text size, which titles to show (English, original language or both), translations, practice defaults, developer tools (import, sample package, package format, reset) |
| **Player** | Verse-by-verse text (right-to-left aware) with a range rail, segment strip, repeat modes (segment, range, each), count or forever, speed 0.5×–1.5×, pause between repetitions including a "recite" pause as long as the segment, tap-to-choose ranges, keyboard shortcuts, lock-screen controls |

The visual design is the prototype's, unchanged: pale sage surfaces, deep teal accent, a gold range rail,
the segment ring as cover art, dark mode. Fonts (Figtree, Amiri for Arabic) are bundled, so it looks the
same offline. Design tokens are the CSS variables at the top of `src/ui/styles.css`.

## Architecture

Dependencies point inward only:

```
ui  →  app (composition root)  →  infrastructure  →  application  →  domain
```

| Folder | What lives here | May import |
|---|---|---|
| `src/domain` | Pure rules and types: `flatten`, ranges, `nextCursor`, `validatePackage`, settings, practice state, library sort and search | itself only |
| `src/application` | `PracticeEngine`; services `LibraryService`, `PracticeService`, `SettingsService`, `DownloadService`; `PracticeProgressRecorder`; the ports (interfaces) for audio, timers, storage, ZIP, catalog | domain |
| `src/infrastructure` | Real implementations: Dexie, JSZip, HTML audio, sample catalog, service-worker registration, placeholder audio | domain, application |
| `src/app` | `createAppServices()`: the one place implementations are chosen and wired | everything below |
| `src/ui` | React screens, components and hooks. Talks to the services only, never to infrastructure | app, application, domain |
| `src/samples` | Three sample texts as plain data | domain types |
| `pwa/` | Service worker template and the Vite plugin that builds it | none |
| `tests/` | Vitest tests; fakes and in-memory repositories in `tests/helpers` | everything |

`tests/architecture.test.ts` fails if a layer imports something it should not, if the UI reaches into
infrastructure, or if Dexie or JSZip is used outside the folder that owns it. To swap the storage engine,
write new repositories and change one line in `src/app/container.ts`.

### Key ideas

- **Segment** is the smallest playable unit. Sections contain verses (groups) which contain segments, and
  a section can have a playable heading. `flatten()` turns that tree into one ordered list with labels
  like `1A`, `1B`, `2A`.
- **The practice rules live in one pure function**, `nextCursor(config, cursor)`: after a segment finishes,
  what plays next, and does a pause come first? Timers and audio are just wiring around it.
- **`PracticeEngine` never touches the DOM.** It talks to an `AudioPort` and a `TimerPort`, so tests drive it
  with a fake clock and a fake audio element.
- **Progress refers to segments by id**, not position, so it survives edits to a text.
- **Content is validated before it is trusted**, on import and again on every open, because stored data
  can be damaged. A bad package is reported in plain language and never reaches the engine.

### Storage (Dexie)

One IndexedDB database, `memorize`:

| Table | Holds | Notes |
|---|---|---|
| `items` | Library metadata: title, author, language, segment count, duration | Small; listing reads only this |
| `documents` | Manifest, content and alignment | Small; read for covers and the Continue card |
| `audio` | The audio Blob | Large; read only when a text is opened for practice |
| `practice` | Saved progress per text | Kept when a text is removed |
| `settings` | App settings | Invalid stored values are replaced by defaults on load |

- A text's rows are written in **one transaction**: all or nothing.
- **Schema history** is in `MemorizeDb.ts`: v1 (stage 2), v2 (adds `documents` and `audio`, copies every stored
  package across), v3 (drops the old table). The upgrade is tested against a database built exactly as stage 2
  left it. Never edit a released version; add a new one.
- The theme choice is also mirrored into `localStorage` and applied by a tiny script in `index.html`, so the
  first paint is already in the right theme. It is the only value stored outside Dexie.
- The app asks the browser for persistent storage, which makes eviction under pressure much less likely.
- Contract tests run the same behaviours against the in-memory and Dexie repositories, so any future
  implementation (for example a sync layer) can be checked against them.

### Content packages

A ZIP with `manifest.json`, `content.json`, `alignment.json` and one audio file (mp3, m4a, ogg, wav, webm).
Files may sit in one top-level folder and names are not case-sensitive. **Settings → Developer tools → Get a
sample package** gives you a real one to copy; **Package format** on the same page shows the three JSON files.

```
file → ZipPackageReader → BrowserAudioProbe → validatePackage → library.save (one transaction)
```

Re-importing the same `contentId` updates the text and keeps your progress. A built-in sample cannot be
overwritten by an import.

### Downloads and catalogs

`DownloadService` installs texts from a `CatalogSource`. Today that is `SampleCatalog`, which lists the
built-in samples and simulates a download (progress, then "verifying") while generating placeholder audio.
A real server catalog is a new class implementing `CatalogSource` (`list()` and `fetch()`); nothing else changes.

### Offline (PWA)

- `npm run build` writes `dist/sw.js`, generated from `pwa/sw.js`. It caches every built file (app, styles,
  fonts, icons), and its version is a hash of them all, so any change makes a new version.
- Once loaded, the app opens with no network. Texts and audio live in IndexedDB, not the cache.
- A new version installs in the background and **waits**. The app shows "A new version is ready" with an
  Update button; it never swaps in the middle of a practice session. It also says "Ready to use offline" after
  the first install.
- Installable on Android, desktop and iOS ("Add to Home Screen"): manifest, standard and maskable icons.
- Service workers need **HTTPS** (or `localhost`). The build uses relative URLs, so `dist/` works from any
  static host and any sub-path. Route state is in the URL hash, so no server rewrite rules are needed.
- Icons come from `public/icons/icon.svg`. To regenerate the PNGs: `npm i --no-save sharp && node scripts/generate-icons.mjs`.

### Accessibility

Every control is keyboard reachable with visible focus; sheets trap focus, close on Escape and make the
rest of the page inert; the current segment is marked with more than color (filled label, thicker rail,
`aria-current`); switches and segmented controls expose their state; Arabic is marked `lang="ar" dir="rtl"`;
motion respects `prefers-reduced-motion`; targets are at least 40 px. Space plays and pauses, Left/Right move
between segments.

## Official content (the catalog)

Official texts come from a `CatalogSource`, listed and downloaded the same way the Library screen
has always worked — the only thing that changed is where the files come from.

### Publishing a text

```bash
# put manifest.json, content.json, alignment.json and the audio file into a zip:
content/tuhfatul-atfaal.zip

npm run build:catalog
```

This validates every zip in `content/` with the same checks the app runs on import, then — only
if every one of them passes — writes the real files into `public/content/`: each package renamed
with a hash of its own bytes (so a cache can never serve the wrong version by mistake) and a
`catalog.json` listing them all. See `content/README.md` for the exact format and failure modes.
Commit `public/content/`, then deploy as usual (`npm run build`); nothing runs this script for
you, so a bad zip can never reach production by accident.

The app re-fetches `catalog.json` (never from cache) when it opens and whenever the tab regains
focus, so a new or changed text appears without the person needing to reinstall the app. An
installed text whose package hash has changed shows **Update available**, and downloading it
replaces the old files — practice progress is kept, since it's stored by segment id, not by file.
A text published in roughly the last three weeks (`manifest.published`, e.g. `"2026-09-20"`) shows
a **New** label until that window passes.

### Why the audio isn't precached for offline

Downloading a text is a deliberate, visible action in the Library, never automatic — the offline
app shell (see below) caches the interface, not the catalog's audio files, so updating the app
never means silently re-downloading every recording again on someone's mobile data. `content/` is
entirely excluded from the service worker's precache list.

### Moving to a database later (e.g. Supabase)

`src/infrastructure/catalog/SupabaseCatalogIndex.ts` reads the same catalog shape from a Supabase
table instead of a static file — swap `JsonCatalogIndex` for it in `src/app/container.ts` and
nothing else in the app changes: `RemoteCatalog`, the downloader, the hash check and the UI are
unaware which one is in use. Point `package_url` at a public Storage bucket (or any CDN) and keep
using `npm run build:catalog`'s hashing approach for cache-safe file names, or compute it
server-side instead. A `docs/SUPABASE.md` sketch of the table schema is a natural next addition
once you're actually moving to it — the current zips-in-git approach is fine up to a few dozen
texts.

### Requesting a text that isn't available

**Settings → Content**, the Library, and Search (when nothing matches) all have a **Request a
text** link. It's a plain `mailto:` link — no form, no backend, nothing stored — it opens the
person's own email app addressed to `CONTENT_REQUEST_EMAIL` in `src/app/config.ts`, which you
should replace with your own address before deploying.

## Not built yet

Deferred by the product spec: accounts and sync, a database-backed catalog in production (the
provider exists — see `SupabaseCatalogIndex` above — but isn't wired in by default), focus/hide-text
recall mode, folders, OCR and user-made alignment, native apps, monetization. The seams for them
are the `CatalogSource` port and the repository interfaces.

Known limits: audio for the bundled sample texts is still generated tones (real official content
goes through `npm run build:catalog`, above); the Arabic in the Tuhfatul Atfaal sample content was
transcribed from a published source and should still be checked against a trusted edition, with
full diacritics added, before being used as official content; not yet tried on a physical phone.
