import { DownloadService, LibraryService, PracticeService, SettingsService } from '../application';
import type {
  AudioDurationProbe, AudioPort, CatalogSource, Clock, LibraryRepository, LocalDataRepository,
  PackageReader, PackageWriter, PracticeStateRepository, SettingsRepository,
} from '../application';
import type { CatalogItem } from '../domain';
import {
  BrowserAudioProbe, DexieLibraryRepository, DexieLocalData, DexiePracticeStateRepository, DexieSettingsRepository,
  HtmlAudioService, JsonCatalogIndex, MemorizeDb, RemoteCatalog, ZipPackageReader, ZipPackageWriter,
} from '../infrastructure';
import { installSamples } from './installSamples';

/** Where the catalog.json published with this build lives, relative to the page. See public/content/README.md. */
const CATALOG_URL = 'content/catalog.json';

/** Everything the UI is allowed to use. The UI never imports infrastructure directly. */
export interface AppServices {
  library: LibraryService;
  practice: PracticeService;
  settings: SettingsService;
  downloads: DownloadService;
  /** Wipes every table (used by "Reset all local data"). */
  data: LocalDataRepository;
  /** Creates a fresh audio player for one practice session. */
  createAudio(): AudioPort;
  /** Downloads everything in the catalog (demos, tests). */
  installSamples(): Promise<CatalogItem[]>;
}

/** The pieces the services are built from. Tests substitute in-memory or fake versions. */
export interface ServiceParts {
  libraryRepo: LibraryRepository;
  practiceRepo: PracticeStateRepository;
  settingsRepo: SettingsRepository;
  data: LocalDataRepository;
  reader: PackageReader;
  writer: PackageWriter;
  probe: AudioDurationProbe;
  catalog: CatalogSource;
  createAudio: () => AudioPort;
  clock?: Clock;
}

export function buildServices(parts: ServiceParts): AppServices {
  const settings = new SettingsService(parts.settingsRepo);
  const library = new LibraryService({
    library: parts.libraryRepo, practice: parts.practiceRepo, reader: parts.reader, writer: parts.writer, probe: parts.probe, clock: parts.clock,
  });
  const downloads = new DownloadService(parts.catalog, library);
  return {
    library,
    practice: new PracticeService(parts.libraryRepo, parts.practiceRepo, settings, parts.clock),
    settings,
    downloads,
    data: parts.data,
    createAudio: parts.createAudio,
    installSamples: () => installSamples(downloads),
  };
}

export interface ServiceOptions {
  /** IndexedDB database name. Tests use a unique name per run. */
  dbName?: string;
  probe?: AudioDurationProbe;
  clock?: Clock;
  /** Defaults to the official catalog published at CATALOG_URL. Pass SampleCatalog for a demo with generated audio. */
  catalog?: CatalogSource;
  createAudio?: () => AudioPort;
}

/** The composition root: the one place where real implementations are chosen and wired together. */
export function createAppServices(options: ServiceOptions = {}): AppServices {
  const db = new MemorizeDb(options.dbName);
  const reader = new ZipPackageReader();
  return buildServices({
    libraryRepo: new DexieLibraryRepository(db),
    practiceRepo: new DexiePracticeStateRepository(db),
    settingsRepo: new DexieSettingsRepository(db),
    data: new DexieLocalData(db),
    reader,
    writer: new ZipPackageWriter(),
    probe: options.probe ?? new BrowserAudioProbe(),
    catalog: options.catalog ?? new RemoteCatalog(new JsonCatalogIndex(CATALOG_URL), reader),
    createAudio: options.createAudio ?? (() => new HtmlAudioService()),
    clock: options.clock,
  });
}
