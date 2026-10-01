import type { AppSettings, CatalogItem, PracticeState } from '../domain';
import type { PackageDocument, PackageRecord } from './packages';

/**
 * Storage ports. Infrastructure implements them (Dexie today); tests use in-memory versions.
 * The same contract tests run against every implementation.
 */

export interface LibraryRepository {
  /** Metadata only. Never loads audio. */
  listItems(): Promise<CatalogItem[]>;
  getItem(id: string): Promise<CatalogItem | undefined>;
  /** Manifest, content and alignment, without the audio. Cheap to read. */
  getDocument(id: string): Promise<PackageDocument | undefined>;
  /** Just the audio. Read only when a text is opened for practice. */
  getAudio(id: string): Promise<Blob | undefined>;
  /** Document and audio together. */
  getPackage(id: string): Promise<PackageRecord | undefined>;
  /** Writes metadata and package together, or neither. Replaces an existing item with the same id. */
  save(item: CatalogItem, record: PackageRecord): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface PracticeStateRepository {
  get(itemId: string): Promise<PracticeState | undefined>;
  list(): Promise<PracticeState[]>;
  put(state: PracticeState): Promise<void>;
}

export interface SettingsRepository {
  /** Always returns valid settings (defaults if nothing is stored). */
  load(): Promise<AppSettings>;
  save(settings: AppSettings): Promise<void>;
}

/** Wipes everything the app stored on this device. */
export interface LocalDataRepository {
  clearAll(): Promise<void>;
}

export interface Clock {
  now(): number;
}
export const systemClock: Clock = { now: () => Date.now() };
