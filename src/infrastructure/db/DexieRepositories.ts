import { DEFAULT_SETTINGS, sanitizeSettings } from '../../domain';
import type { AppSettings, CatalogItem, PracticeState } from '../../domain';
import type { LibraryRepository, LocalDataRepository, PackageDocument, PackageRecord, PracticeStateRepository, SettingsRepository } from '../../application';
import type { MemorizeDb } from './MemorizeDb';

const SETTINGS_KEY = 'app';

export class DexieLibraryRepository implements LibraryRepository {
  constructor(private readonly db: MemorizeDb) {}

  listItems(): Promise<CatalogItem[]> {
    return this.db.items.toArray();
  }

  getItem(id: string): Promise<CatalogItem | undefined> {
    return this.db.items.get(id);
  }

  getDocument(id: string): Promise<PackageDocument | undefined> {
    return this.db.documents.get(id);
  }

  async getAudio(id: string): Promise<Blob | undefined> {
    return (await this.db.audio.get(id))?.blob;
  }

  async getPackage(id: string): Promise<PackageRecord | undefined> {
    const [document, blob] = await Promise.all([this.getDocument(id), this.getAudio(id)]);
    return document && blob ? { ...document, audio: blob } : undefined;
  }

  /** One transaction: metadata, document and audio are written together or not at all. */
  save(item: CatalogItem, record: PackageRecord): Promise<void> {
    const { db } = this;
    const { audio, ...document } = record;
    return db.transaction('rw', [db.items, db.documents, db.audio], async () => {
      await db.audio.put({ id: record.id, blob: audio });
      await db.documents.put(document);
      await db.items.put(item);
    });
  }

  remove(id: string): Promise<void> {
    const { db } = this;
    return db.transaction('rw', [db.items, db.documents, db.audio], async () => {
      await db.items.delete(id);
      await db.documents.delete(id);
      await db.audio.delete(id);
    });
  }
}

export class DexiePracticeStateRepository implements PracticeStateRepository {
  constructor(private readonly db: MemorizeDb) {}

  get(itemId: string): Promise<PracticeState | undefined> {
    return this.db.practice.get(itemId);
  }

  list(): Promise<PracticeState[]> {
    return this.db.practice.toArray();
  }

  async put(state: PracticeState): Promise<void> {
    await this.db.practice.put(state);
  }
}

export class DexieSettingsRepository implements SettingsRepository {
  constructor(private readonly db: MemorizeDb) {}

  async load(): Promise<AppSettings> {
    const row = await this.db.settings.get(SETTINGS_KEY);
    return row ? sanitizeSettings(row.value) : structuredClone(DEFAULT_SETTINGS);
  }

  async save(settings: AppSettings): Promise<void> {
    await this.db.settings.put({ key: SETTINGS_KEY, value: settings });
  }
}

export class DexieLocalData implements LocalDataRepository {
  constructor(private readonly db: MemorizeDb) {}

  clearAll(): Promise<void> {
    const { db } = this;
    return db.transaction('rw', [db.items, db.documents, db.audio, db.practice, db.settings], async () => {
      await Promise.all([db.items.clear(), db.documents.clear(), db.audio.clear(), db.practice.clear(), db.settings.clear()]);
    });
  }
}
