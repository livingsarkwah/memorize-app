import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { PackageReadError } from '../../src/application';
import { ZipPackageReader, ZipPackageWriter } from '../../src/infrastructure';
import { makeRawPackage } from '../helpers/memory';

const reader = new ZipPackageReader();
const raw = makeRawPackage();
const manifest = raw.manifest as Record<string, unknown>;

async function zipOf(files: Record<string, string | Uint8Array>): Promise<Blob> {
  const zip = new JSZip();
  for (const [name, data] of Object.entries(files)) zip.file(name, data);
  return zip.generateAsync({ type: 'blob' });
}
const goodFiles = () => ({
  'manifest.json': JSON.stringify(manifest),
  'content.json': JSON.stringify(raw.content),
  'alignment.json': JSON.stringify(raw.alignment),
  'audio.mp3': 'not really audio',
});
const failure = async (blob: Blob) => (await reader.read(blob).catch((e: unknown) => e)) as Error;

describe('ZipPackageReader', () => {
  it('reads the four files', async () => {
    const pkg = await reader.read(await zipOf(goodFiles()));
    expect(pkg.manifest).toEqual(manifest);
    expect(pkg.content).toEqual(raw.content);
    expect(pkg.alignment).toEqual(raw.alignment);
    expect(pkg.audioName).toBe('audio.mp3');
    expect(pkg.audio.type).toBe('audio/mpeg');
    expect(await pkg.audio.text()).toBe('not really audio');
  });

  it('accepts files inside a single top-level folder, in any letter case', async () => {
    const files = Object.fromEntries(Object.entries(goodFiles()).map(([k, v]) => ['My Package/' + k.toUpperCase().replace('.JSON', '.json').replace('.MP3', '.mp3'), v]));
    const pkg = await reader.read(await zipOf(files));
    expect(pkg.content).toEqual(raw.content);
    expect(pkg.audioName).toBe('AUDIO.mp3');
  });

  it('ignores macOS metadata folders', async () => {
    const pkg = await reader.read(await zipOf({ ...goodFiles(), '__MACOSX/manifest.json': 'garbage', '__MACOSX/._audio.mp3': 'garbage' }));
    expect(pkg.manifest).toEqual(manifest);
  });

  it('honours the file names declared in the manifest', async () => {
    const files = {
      'manifest.json': JSON.stringify({ ...manifest, audio: 'recording.m4a', content: 'text.json', alignment: 'timing.json' }),
      'text.json': JSON.stringify(raw.content), 'timing.json': JSON.stringify(raw.alignment), 'recording.m4a': 'x', 'other.mp3': 'y',
    };
    const pkg = await reader.read(await zipOf(files));
    expect(pkg.audioName).toBe('recording.m4a');
    expect(pkg.audio.type).toBe('audio/mp4');
  });

  it('falls back to any audio file when the manifest does not name one', async () => {
    const { audio: _unused, ...withoutAudio } = manifest;
    void _unused;
    const files = { ...goodFiles(), 'manifest.json': JSON.stringify(withoutAudio), 'audio.mp3': 'x', 'take-2.ogg': 'y' };
    expect((await reader.read(await zipOf(files))).audioName).toBe('audio.mp3');
  });

  it('gives a readable message for every kind of broken package', async () => {
    const { 'manifest.json': _m, ...noManifest } = goodFiles();
    const { 'content.json': _c, ...noContent } = goodFiles();
    const { 'alignment.json': _a, ...noAlignment } = goodFiles();
    const { 'audio.mp3': _s, ...noAudio } = goodFiles();
    void [_m, _c, _a, _s];

    const cases: [string, Blob, RegExp][] = [
      ['not a zip', new Blob(['plain text']), /not a valid ZIP/],
      ['no manifest', await zipOf(noManifest), /manifest\.json was not found/],
      ['no content', await zipOf(noContent), /content\.json was not found/],
      ['no alignment', await zipOf(noAlignment), /alignment\.json was not found/],
      ['no audio', await zipOf(noAudio), /audio file was not found/],
      ['bad manifest json', await zipOf({ ...goodFiles(), 'manifest.json': '{ nope' }), /manifest\.json could not be read as JSON/],
      ['bad content json', await zipOf({ ...goodFiles(), 'content.json': '[1,' }), /content\.json could not be read as JSON/],
      ['bad alignment json', await zipOf({ ...goodFiles(), 'alignment.json': '' }), /alignment\.json could not be read as JSON/],
    ];
    for (const [label, blob, message] of cases) {
      const error = await failure(blob);
      expect(error, label).toBeInstanceOf(PackageReadError);
      expect(error.message, label).toMatch(message);
    }
  });

  it('does not judge the content: an invalid manifest is passed on for validation', async () => {
    const pkg = await reader.read(await zipOf({ ...goodFiles(), 'manifest.json': JSON.stringify({ hello: 'world' }) }));
    expect(pkg.manifest).toEqual({ hello: 'world' });
  });
});

describe('ZipPackageWriter', () => {
  it('writes a ZIP the reader reads back identically', async () => {
    const pkg = { manifest: raw.manifest as never, content: raw.content as never, alignment: raw.alignment as never, audio: raw.audio, audioName: 'audio.mp3' };
    const back = await reader.read(await new ZipPackageWriter().write(pkg));
    expect(back.manifest).toEqual(raw.manifest);
    expect(back.content).toEqual(raw.content);
    expect(back.alignment).toEqual(raw.alignment);
    expect(await back.audio.text()).toBe('fake audio bytes');
    expect(back.audioName).toBe('audio.mp3');
  });

  it('puts the four files at the top level', async () => {
    const zip = await JSZip.loadAsync(await new ZipPackageWriter().write({ manifest: raw.manifest as never, content: raw.content as never, alignment: raw.alignment as never, audio: raw.audio, audioName: 'audio.mp3' }));
    expect(Object.keys(zip.files).sort()).toEqual(['alignment.json', 'audio.mp3', 'content.json', 'manifest.json']);
  });
});
