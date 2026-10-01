import { useRef } from 'react';
import { useApp } from '../AppState';
import type { TextSize, ThemeSetting, TitleMode, PauseSetting } from '../../domain';
import { Icon } from '../components/Icon';
import { Segmented, Stepper, SwitchRow } from '../components/Controls';
import type { Choice } from '../components/Controls';
import { RequestContentLink } from '../components/RequestContentLink';

const RATES: Choice<number>[] = [0.5, 0.75, 1, 1.25, 1.5].map((v) => ({ value: v, label: `${v}×` }));
const PAUSES: Choice<PauseSetting>[] = [
  { value: 0, label: 'None' }, { value: 1, label: '1 s' }, { value: 2, label: '2 s' }, { value: 3, label: '3 s' }, { value: 5, label: '5 s' }, { value: 'auto', label: 'Recite' },
];

export function SettingsScreen() {
  const { settings, updateSettings, importFile, exportSample, resetAll } = useApp();
  const file = useRef<HTMLInputElement>(null);
  const defaults = settings.practiceDefaults;

  return (
    <div className="page">
      <h1 className="h1">Settings</h1>

      <section className="setgroup">
        <h2>Appearance</h2>
        <div className="lbl">Theme</div>
        <Segmented<ThemeSetting> label="Theme" value={settings.theme} onChange={(theme) => void updateSettings({ theme })}
          choices={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
        <div className="lbl">Text size</div>
        <Segmented<TextSize> label="Text size" value={settings.textSize} onChange={(textSize) => void updateSettings({ textSize })}
          choices={[{ value: 's', label: 'Small' }, { value: 'm', label: 'Medium' }, { value: 'l', label: 'Large' }]} />
        <div className="lbl">Titles</div>
        <Segmented<TitleMode> label="Which titles to show" value={settings.titles} onChange={(titles) => void updateSettings({ titles })}
          choices={[{ value: 'both', label: 'Both' }, { value: 'english', label: 'English' }, { value: 'native', label: 'Original' }]} />
        <p className="note">“Original” shows the title in the text’s own language, such as Arabic, when the package has one.</p>
        <SwitchRow label="Show translation under each segment" hint="Uses the translation stored in the package, when there is one."
          checked={settings.showTranslation} onChange={(showTranslation) => void updateSettings({ showTranslation })} />
      </section>

      <section className="setgroup">
        <h2>Practice defaults</h2>
        <p className="note" style={{ margin: '0 0 4px' }}>These apply to texts you haven’t practiced yet.</p>
        <div className="lbl">Speed</div>
        <Segmented<number> label="Default speed" value={defaults.rate} choices={RATES} onChange={(rate) => void updateSettings({ practiceDefaults: { rate } })} />
        <div className="lbl">Pause between repetitions</div>
        <Segmented<PauseSetting> label="Default pause" value={defaults.pause} choices={PAUSES} onChange={(pause) => void updateSettings({ practiceDefaults: { pause } })} />
        <div className="field-row">
          <span className="lbl" style={{ margin: 0 }}>Repeats</span>
          <Stepper value={defaults.count} decreaseLabel="Fewer repeats" increaseLabel="More repeats" onChange={(count) => void updateSettings({ practiceDefaults: { count } })} />
        </div>
      </section>

      <section className="setgroup">
        <h2>Content</h2>
        <p className="note" style={{ margin: '0 0 12px' }}>Looking for a text that isn’t in the Library? Ask for it — no account or form needed.</p>
        <RequestContentLink />
      </section>

      <section className="setgroup">
        <h2>Developer tools</h2>
        <p className="note" style={{ margin: '0 0 12px' }}>For testing the content pipeline. Imported packages stay on this device.</p>
        <div className="presets" style={{ marginTop: 0 }}>
          <button type="button" className="btn sm" onClick={() => file.current?.click()}><Icon name="import" size={18} />Import a package</button>
          <input ref={file} type="file" accept=".zip,application/zip" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importFile(f); }} />
          <button type="button" className="btn sm" onClick={() => void exportSample()}><Icon name="download" size={18} />Get a sample package</button>
        </div>
        <details className="guide">
          <summary>Package format</summary>
          <p className="note">A package is a ZIP with a manifest, the text and its structure, the alignment, and one audio file.</p>
          <pre className="code">{`manifest.json
{ "schemaVersion": 1, "contentId": "my-poem", "version": 1,
  "title": "My Poem", "titleNative": "", "language": "en",
  "contentType": "poem", "author": "Name", "audio": "audio.mp3" }`}</pre>
          <pre className="code">{`content.json
{ "sections": [ { "id": "s1", "title": "Part one",
  "groups": [ { "id": "v1", "label": "Verse 1", "segments": [
    { "id": "v1a", "text": "First half", "translation": "" },
    { "id": "v1b", "text": "Second half" } ] } ] } ] }
// A section can hold "segments" directly instead of "groups",
// and can add "heading": { "id", "text" } for a recited title.`}</pre>
          <pre className="code">{`alignment.json  (seconds)
{ "segments": { "v1a": { "start": 0.4, "end": 3.1 },
                "v1b": { "start": 3.5, "end": 6.2 } } }`}</pre>
        </details>
        <div style={{ marginTop: 14 }}>
          <button type="button" className="btn sm danger" onClick={() => void resetAll()}>Reset all local data</button>
        </div>
      </section>

      <section className="setgroup">
        <h2>About this prototype</h2>
        <p className="note" style={{ margin: 0 }}>
          The audio here is generated tones, one short melody per segment, so you can test repeating, ranges, speed and pauses.
          Official downloads are simulated. Practice progress and settings are saved on this device only, and no account is needed.
        </p>
      </section>
    </div>
  );
}
