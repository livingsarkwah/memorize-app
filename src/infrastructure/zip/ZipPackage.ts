import JSZip from 'jszip';
import { PackageReadError } from '../../application';
import type { PackageReader, PackageWriter, RawPackage } from '../../application';

const AUDIO_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg',
  wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', webm: 'audio/webm',
};

const extensionOf = (name: string): string => name.split('.').pop()?.toLowerCase() ?? '';

/**
 * Reads a package ZIP: manifest.json, content.json, alignment.json and one audio file.
 * Tolerant about layout (files may sit inside one top-level folder, names are case-insensitive)
 * and strict about content: anything missing or unparseable raises a PackageReadError
 * whose message can be shown to the user as is.
 */
export class ZipPackageReader implements PackageReader {
  async read(file: Blob): Promise<RawPackage> {
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(file);
    } catch {
      throw new PackageReadError('This file is not a valid ZIP archive.');
    }

    const names = Object.keys(zip.files).filter((n) => !zip.files[n]!.dir && !n.startsWith('__MACOSX'));
    const find = (name: string): string | undefined => {
      const lower = name.toLowerCase();
      return names.find((n) => n.toLowerCase() === lower) ?? names.find((n) => n.toLowerCase().endsWith('/' + lower));
    };

    const manifestName = find('manifest.json');
    if (!manifestName) throw new PackageReadError('manifest.json was not found. The package appears to be incomplete.');
    const base = manifestName.slice(0, manifestName.lastIndexOf('/') + 1);

    const readJson = async (name: string): Promise<unknown> => {
      try {
        return JSON.parse(await zip.file(name)!.async('string'));
      } catch {
        throw new PackageReadError(`${name.split('/').pop()} could not be read as JSON.`);
      }
    };

    const manifest = await readJson(manifestName);
    const declared = (key: 'content' | 'alignment', fallback: string): string => {
      const value = typeof manifest === 'object' && manifest !== null ? (manifest as Record<string, unknown>)[key] : undefined;
      return typeof value === 'string' && value ? value : fallback;
    };
    const locate = (declaredName: string): string | undefined => find(base + declaredName) ?? find(declaredName);

    const contentName = locate(declared('content', 'content.json'));
    const alignmentName = locate(declared('alignment', 'alignment.json'));
    if (!contentName) throw new PackageReadError('content.json was not found. The package appears to be incomplete.');
    if (!alignmentName) throw new PackageReadError('alignment.json was not found. The package appears to be incomplete.');

    const audioDeclared = typeof manifest === 'object' && manifest !== null ? (manifest as Record<string, unknown>).audio : undefined;
    const audioName =
      (typeof audioDeclared === 'string' && audioDeclared ? locate(audioDeclared) : undefined) ??
      names.find((n) => extensionOf(n) in AUDIO_TYPES);
    if (!audioName) throw new PackageReadError('The audio file was not found. The package appears to be incomplete.');

    const bytes = await zip.file(audioName)!.async('arraybuffer');
    return {
      manifest,
      content: await readJson(contentName),
      alignment: await readJson(alignmentName),
      audio: new Blob([bytes], { type: AUDIO_TYPES[extensionOf(audioName)] ?? 'audio/mpeg' }),
      audioName: audioName.split('/').pop()!,
    };
  }
}

/** Writes a package in the layout ZipPackageReader reads: four files at the top level. */
export class ZipPackageWriter implements PackageWriter {
  async write(pkg: Parameters<PackageWriter['write']>[0]): Promise<Blob> {
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify(pkg.manifest, null, 2));
    zip.file('content.json', JSON.stringify(pkg.content, null, 2));
    zip.file('alignment.json', JSON.stringify(pkg.alignment, null, 2));
    zip.file(pkg.audioName, pkg.audio);
    return zip.generateAsync({ type: 'blob' });
  }
}
