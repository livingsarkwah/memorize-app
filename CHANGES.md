# Changes

## Stage 4: official content catalog, updates, and "request a text" (complete)

New:

- **Content pipeline**: `npm run build:catalog` validates every package zip in `content/` (the same
  checks the app runs on import), computes a SHA-256 of each, copies them into `public/content/`
  under a content-hashed filename, and writes `public/content/catalog.json`. Fails the whole run
  (writing nothing) if any zip is invalid, named inconsistently with its own contentId, or reuses
  another zip's contentId. See `content/README.md`.
- **`CatalogSource` is now the real catalog by default.** `RemoteCatalog` + `JsonCatalogIndex` reads
  `content/catalog.json` (always re-fetched, never from a stale cache); `SampleCatalog` (the melody
  generator) is kept for tests and demos, passed in explicitly.
- **`PackageDownloader`**: streams a download with real progress and rejects it if its SHA-256
  doesn't match what the catalog published — a damaged or truncated download can never be installed.
- **`SupabaseCatalogIndex`**: the same catalog read from a Supabase table instead of a static file,
  for when the content outgrows zips-in-git. Swapping it in is a one-line change in `src/app/container.ts`.
- **Update and "New" detection**: `isUpdateAvailable` (by package hash, falling back to version) and
  `isNewlyPublished` (`manifest.published`, a 3-week window). The Library and Home show **Update
  available** / **New** labels; downloading an update replaces the old package and keeps practice
  progress (segment ids are stable across a content change).
- **The catalog is rechecked** on open and whenever the tab regains focus (`visibilitychange`), so a
  newly published or changed text appears without reinstalling the app.
- **"Request a text"**: a plain `mailto:` link (`src/ui/components/RequestContentLink.tsx`, address in
  `src/app/config.ts`) in Settings → Content, the Library, and Search's no-results state, prefilled
  with the search query. No form, no backend, nothing stored.
- `Manifest` gains optional `reciter` and `published` fields; `CatalogItem` gains optional `reciter`
  and `packageHash`.
- **Dexie schema v4**: renames the old `'sample'` item source to `'official'`, keeping everything else.
- **Service worker**: `content/` (the catalog and its audio packages) is entirely excluded from the
  offline precache — downloading a text stays a deliberate, visible action, never bundled into the
  app-shell cache.
- Tests: **329** (was 272): the catalog layer (downloader, hash verification, both index providers,
  entry parsing, end-to-end download-and-unpack), the v3→v4 migration, the precache exclusion, and the
  New/Update/request-a-text UI, including a mutation-checked test for the focus-triggered recheck.

Unchanged: the Player, the practice engine, and every screen's layout and design.

## Stage 3: screens and offline shell (complete)

Replaces every earlier zip. New since stage 2:

- **All five screens** as React, with the prototype's design and CSS unchanged: Home (Continue card, recent,
  available), Library (sort, download with progress, remove with confirmation, import), Search, Settings, and the
  **Player** (range rail, segment strip, repeat modes, tap-to-choose range, settings sheet, dock, keyboard
  shortcuts, lock-screen controls, resume)
- **Offline PWA**: web manifest, standard and maskable icons, a generated service worker (versioned by a hash of
  the build, waits before taking over), "Ready to use offline" and "Update ready" messages
- Self-hosted fonts (Figtree, Amiri) so it looks the same offline
- Theme applied before first paint via a small `localStorage` mirror (the one value outside Dexie)
- `DownloadService`, `CatalogSource` port and `SampleCatalog` (simulated downloads)
- **Dexie schema v3**: packages split into `documents` (small) and `audio` (large), with a versioned upgrade from
  stage 2 that is tested against a real stage-2 database
- `LibraryService.structure()` reads a text without loading its audio
- `buildServices()` in the composition root so the whole app can be assembled from in-memory parts in tests
- Tests: **272** (was 165): jsdom UI tests for every screen, the Player and dialogs; service-worker tests that run
  the real worker script against a fake browser; registration tests; migration test

Changed: `src/ui` no longer contains the stage-2 workbench. `vite.config.ts` sets `base: './'` and adds the
service-worker plugin. The architecture test also enforces that the UI never imports infrastructure.

Bugs found and fixed while building: a service-worker template placeholder that was replaced inside its own
header comment (caught by inspecting the built file, now covered by tests); dialog confirmations that could
resolve twice; lists not refreshing after the final progress save when leaving the Player.

## Stage 2: storage and import
Dexie storage, ZIP import/export, saved progress and settings (165 tests).

## Stage 1: foundation
Project setup, domain rules, `PracticeEngine`, placeholder audio, samples (68 tests).
