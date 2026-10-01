import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { AppServices } from '../app/container';
import { OFFLINE_READY_EVENT, UPDATE_READY_EVENT } from '../application';
import type { AvailableItem, DownloadProgress, UpdateReadyDetail } from '../application';
import { DEFAULT_SETTINGS } from '../domain';
import type { AppSettings, ContentStructure, LibraryEntry } from '../domain';
import { applyAppearance } from './appearance';
import { saveBlob } from './download';
import { navigate } from './router';
import type { SettingsPatch } from '../application';

export interface ToastMessage {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
}

export type DialogState =
  | { kind: 'confirm'; title: string; body: string; confirmLabel: string; danger: boolean; resolve: (ok: boolean) => void }
  | { kind: 'problem'; title: string; message: string; problems: string[] };

export interface AppApi {
  services: AppServices;
  settings: AppSettings;
  updateSettings(patch: SettingsPatch): Promise<void>;

  /** Installed texts with their saved progress. */
  installed: LibraryEntry[];
  /** Text structure of each installed text, for covers and the Continue card. */
  structures: ReadonlyMap<string, ContentStructure>;
  available: AvailableItem[];
  /** Installed official texts whose published version has changed. */
  updates: AvailableItem[];
  /** False until the first load from storage has finished. */
  loaded: boolean;
  refresh(): Promise<void>;

  downloads: Readonly<Record<string, DownloadProgress>>;
  startDownload(id: string): void;
  removeItem(entry: LibraryEntry): Promise<void>;
  importFile(file: File): Promise<void>;
  exportSample(): Promise<void>;
  resetAll(): Promise<void>;

  toast: ToastMessage | null;
  showToast(message: string, action?: ToastMessage['action'], sticky?: boolean): void;
  dismissToast(): void;
  dialog: DialogState | null;
  closeDialog(): void;
  /** Answers the open confirm dialog. */
  answerConfirm(ok: boolean): void;
  confirm(options: { title: string; body: string; confirmLabel: string; danger?: boolean }): Promise<boolean>;
}

const AppContext = createContext<AppApi | null>(null);

export function useApp(): AppApi {
  const api = useContext(AppContext);
  if (!api) throw new Error('useApp must be used inside <AppStateProvider>.');
  return api;
}

const TOAST_MS = 4200;
const SAMPLE_ID = 'tuhfatul-atfaal';

export function AppStateProvider({ services, children }: { services: AppServices; children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [installed, setInstalled] = useState<LibraryEntry[]>([]);
  const [structures, setStructures] = useState<ReadonlyMap<string, ContentStructure>>(new Map());
  const [available, setAvailable] = useState<AvailableItem[]>([]);
  const [updates, setUpdates] = useState<AvailableItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [downloads, setDownloads] = useState<Record<string, DownloadProgress>>({});
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [dialog, setDialogState] = useState<DialogState | null>(null);
  const dialogRef = useRef<DialogState | null>(null);
  const setDialog = useCallback((d: DialogState | null) => { dialogRef.current = d; setDialogState(d); }, []);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const toastId = useRef(0);

  const refresh = useCallback(async () => {
    const [entries, check] = await Promise.all([services.library.entries(), services.downloads.check()]);
    const docs = await Promise.all(entries.map(async (e) => [e.item.id, await services.library.structure(e.item.id)] as const));
    setInstalled(entries);
    setStructures(new Map(docs.filter((d): d is [string, ContentStructure] => d[1] !== undefined)));
    setAvailable(check.available);
    setUpdates(check.updates);
    setLoaded(true);
  }, [services]);

  useEffect(() => {
    let cancelled = false;
    void services.settings.get().then((s) => { if (!cancelled) setSettings(s); });
    void refresh();
    return () => { cancelled = true; };
  }, [services, refresh]);

  // Re-check the catalog (new texts, updates) when the person returns to the tab, so content
  // added since it was opened shows up without needing a full reload. Never runs concurrently
  // with itself if visibility toggles quickly.
  useEffect(() => {
    let running = false;
    const onVisible = (): void => {
      if (document.visibilityState !== 'visible' || running) return;
      running = true;
      void refresh().finally(() => { running = false; });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  useEffect(() => { applyAppearance(settings); }, [settings.theme, settings.textSize]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateSettings = useCallback(async (patch: SettingsPatch) => {
    const merged = await services.settings.update(patch);
    setSettings(merged);
  }, [services]);

  const dismissToast = useCallback(() => { clearTimeout(toastTimer.current); setToast(null); }, []);
  const showToast = useCallback((message: string, action?: ToastMessage['action'], sticky = false) => {
    clearTimeout(toastTimer.current);
    setToast({ id: ++toastId.current, message, action });
    if (!sticky) toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // Messages from the offline app shell (see infrastructure/pwa): first install done, or an update is waiting.
  useEffect(() => {
    const onOffline = (): void => showToast('Ready to use offline.');
    const onUpdate = (e: Event): void => {
      const { apply } = (e as CustomEvent<UpdateReadyDetail>).detail;
      showToast('A new version is ready.', { label: 'Update', run: apply }, true);
    };
    window.addEventListener(OFFLINE_READY_EVENT, onOffline);
    window.addEventListener(UPDATE_READY_EVENT, onUpdate);
    return () => {
      window.removeEventListener(OFFLINE_READY_EVENT, onOffline);
      window.removeEventListener(UPDATE_READY_EVENT, onUpdate);
    };
  }, [showToast]);

  const confirm = useCallback((o: { title: string; body: string; confirmLabel: string; danger?: boolean }) =>
    new Promise<boolean>((resolve) => setDialog({ kind: 'confirm', title: o.title, body: o.body, confirmLabel: o.confirmLabel, danger: !!o.danger, resolve })), [setDialog]);
  const answerConfirm = useCallback((ok: boolean) => {
    const d = dialogRef.current;
    if (d?.kind === 'confirm') d.resolve(ok);
    setDialog(null);
  }, [setDialog]);
  const closeDialog = useCallback(() => answerConfirm(false), [answerConfirm]);

  const startDownload = useCallback((id: string) => {
    if (downloads[id]) return;
    const title = available.find((a) => a.id === id)?.title
      ?? updates.find((a) => a.id === id)?.title
      ?? installed.find((e) => e.item.id === id)?.item.title
      ?? id;
    const wasInstalled = installed.some((e) => e.item.id === id);
    setDownloads((d) => ({ ...d, [id]: { phase: 'downloading', fraction: 0 } }));
    const finish = (): void => setDownloads((d) => { const { [id]: _done, ...rest } = d; void _done; return rest; });
    services.downloads
      .download(id, (progress) => setDownloads((d) => ({ ...d, [id]: progress })))
      .then(async () => {
        finish();
        await refresh();
        showToast(
          wasInstalled ? `${title} was updated.` : `${title} is ready to practice.`,
          { label: 'Open', run: () => navigate({ name: 'player', id }) },
        );
      })
      .catch((e: Error) => {
        finish();
        showToast(e.message.startsWith('Invalid package')
          ? 'This content package could not be loaded. The package appears to be incomplete.'
          : 'The download failed. Check your connection and try again.');
      });
  }, [downloads, available, updates, installed, services, refresh, showToast]);

  const removeItem = useCallback(async ({ item }: LibraryEntry) => {
    const body = item.source === 'imported'
      ? `“${item.title}” was imported from a file. Removing it deletes the package from this device, and you’ll need the ZIP again to get it back. Your practice history is kept.`
      : 'You can download it again any time. Your practice history is kept.';
    if (!(await confirm({ title: `Remove ${item.title}?`, body, confirmLabel: 'Remove', danger: true }))) return;
    await services.library.remove(item.id);
    await refresh();
    showToast(`${item.title} was removed from this device.`);
  }, [confirm, services, refresh, showToast]);

  const importFile = useCallback(async (file: File) => {
    const result = await services.library.importPackage(file);
    if (!result.ok) {
      setDialog({ kind: 'problem', title: 'This package could not be imported', message: result.message, problems: result.problems });
      return;
    }
    await refresh();
    navigate({ name: 'library' });
    showToast(`${result.item.title} was ${result.replaced ? 'updated' : 'imported'}.`, { label: 'Open', run: () => navigate({ name: 'player', id: result.item.id }) });
  }, [services, refresh, showToast, setDialog]);

  const exportSample = useCallback(async () => {
    try {
      if (!(await services.library.entries()).some((e) => e.item.id === SAMPLE_ID)) {
        await services.downloads.download(SAMPLE_ID);
        await refresh();
      }
      const blob = await services.library.exportPackage(SAMPLE_ID, `${SAMPLE_ID}-sample`, 'Tuhfatul Atfaal (sample package)');
      saveBlob(blob, `${SAMPLE_ID}-sample-v1.zip`);
    } catch {
      showToast('The sample package could not be created.');
    }
  }, [services, refresh, showToast]);

  const resetAll = useCallback(async () => {
    const ok = await confirm({ title: 'Reset all local data?', body: 'This clears your settings, practice history, downloads and imported packages from this device.', confirmLabel: 'Reset', danger: true });
    if (!ok) return;
    await services.data.clearAll();
    setSettings(DEFAULT_SETTINGS);
    await refresh();
    navigate({ name: 'home' });
    showToast('Local data was cleared.');
  }, [confirm, services, refresh, showToast]);

  const api = useMemo<AppApi>(() => ({
    services, settings, updateSettings, installed, structures, available, updates, loaded, refresh, downloads, startDownload,
    removeItem, importFile, exportSample, resetAll, toast, showToast, dismissToast, dialog, closeDialog, answerConfirm, confirm,
  }), [services, settings, updateSettings, installed, structures, available, updates, loaded, refresh, downloads, startDownload,
    removeItem, importFile, exportSample, resetAll, toast, showToast, dismissToast, dialog, closeDialog, answerConfirm, confirm]);

  return <AppContext.Provider value={api}>{children}</AppContext.Provider>;
}
