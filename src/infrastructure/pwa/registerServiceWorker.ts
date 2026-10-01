import { OFFLINE_READY_EVENT, UPDATE_READY_EVENT } from '../../application';
import type { UpdateReadyDetail } from '../../application';

export interface RegisterOptions {
  swUrl?: string;
  /** Reloads the page after a new version takes over. Replaceable in tests. */
  reload?: () => void;
}

/**
 * Registers the service worker and reports what happens as window events:
 *  - OFFLINE_READY_EVENT after the very first install (the app can now open with no network)
 *  - UPDATE_READY_EVENT when a new version is waiting; call `detail.apply()` to switch to it
 * Does nothing where service workers are unsupported.
 */
export async function registerServiceWorker(options: RegisterOptions = {}): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const { swUrl = './sw.js', reload = () => location.reload() } = options;
  const container = navigator.serviceWorker;
  const hadController = !!container.controller;

  const announceUpdate = (worker: ServiceWorker): void => {
    const detail: UpdateReadyDetail = { apply: () => worker.postMessage({ type: 'SKIP_WAITING' }) };
    window.dispatchEvent(new CustomEvent<UpdateReadyDetail>(UPDATE_READY_EVENT, { detail }));
  };

  const watch = (worker: ServiceWorker): void => {
    worker.addEventListener('statechange', () => {
      if (worker.state !== 'installed') return;
      if (container.controller) announceUpdate(worker); // an older version is running: this one is an update
      else window.dispatchEvent(new Event(OFFLINE_READY_EVENT)); // first install
    });
  };

  const registration = await container.register(swUrl);
  if (registration.installing) watch(registration.installing);
  if (registration.waiting && container.controller) announceUpdate(registration.waiting);
  registration.addEventListener('updatefound', () => { if (registration.installing) watch(registration.installing); });

  // Reload once when a new version takes over, but not when the very first one claims the page.
  let reloaded = false;
  container.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    reload();
  });
}
