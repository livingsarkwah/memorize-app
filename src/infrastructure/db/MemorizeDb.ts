import Dexie from 'dexie';
import type { Table } from 'dexie';
import type { PackageDocument } from '../../application';
import type { AppSettings, CatalogItem, PracticeState } from '../../domain';

/** One row per setting group. Today there is a single row, key 'app'. */
export interface SettingsRow {
  key: string;
  value: AppSettings;
}

/** The audio of one text, kept apart from its document so the (small) text can be read without it. */
export interface AudioRow {
  id: string;
  blob: Blob;
}

/** Stage 2 layout, kept only so old databases can be upgraded. */
interface LegacyPackageRow extends PackageDocument {
  audio: Blob;
}

/**
 * The single local database.
 *
 *  items      catalog metadata (small, listed often)
 *  documents  manifest + content + alignment (small, read when the text itself is needed)
 *  audio      the audio Blob (large, read only when a text is opened for practice)
 *  practice   saved progress per text; kept even if the text is removed
 *  settings   app settings
 *
 * Schema history (never edit a released version; add a new one):
 *  1  items, packages (document + audio together), practice, settings
 *  2  adds documents + audio and copies every package into them
 *  3  drops packages
 *  4  renames the item source 'sample' to 'official' (the catalog now delivers real texts)
 */
export class MemorizeDb extends Dexie {
  items!: Table<CatalogItem, string>;
  documents!: Table<PackageDocument, string>;
  audio!: Table<AudioRow, string>;
  practice!: Table<PracticeState, string>;
  settings!: Table<SettingsRow, string>;

  constructor(name = 'memorize') {
    super(name);

    this.version(1).stores({
      items: 'id, title, addedAt',
      packages: 'id',
      practice: 'itemId, lastPlayedAt',
      settings: 'key',
    });

    this.version(2)
      .stores({ documents: 'id', audio: 'id' })
      .upgrade(async (tx) => {
        await tx.table<LegacyPackageRow, string>('packages').each(async (row) => {
          const { audio, ...document } = row;
          await tx.table('documents').put(document);
          await tx.table('audio').put({ id: row.id, blob: audio });
        });
      });

    this.version(3).stores({ packages: null });

    this.version(4)
      .stores({})
      .upgrade((tx) =>
        tx.table('items').toCollection().modify((item: { source?: string }) => {
          if (item.source === 'sample') item.source = 'official';
        }),
      );
  }
}
