// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OFFLINE_READY_EVENT, UPDATE_READY_EVENT } from '../../src/application';
import { registerServiceWorker } from '../../src/infrastructure';

type Listener = () => void;
class FakeWorker {
  state = 'installing';
  posted: unknown[] = [];
  private listeners: Listener[] = [];
  addEventListener(_type: string, fn: Listener) { this.listeners.push(fn); }
  postMessage(message: unknown) { this.posted.push(message); }
  become(state: string) { this.state = state; this.listeners.forEach((l) => l()); }
}
class FakeRegistration {
  installing: FakeWorker | null = null;
  waiting: FakeWorker | null = null;
  private listeners: Listener[] = [];
  addEventListener(_type: string, fn: Listener) { this.listeners.push(fn); }
  found(worker: FakeWorker) { this.installing = worker; this.listeners.forEach((l) => l()); }
}
class FakeContainer {
  controller: object | null = null;
  registration = new FakeRegistration();
  registered: string[] = [];
  private listeners: Listener[] = [];
  register = async (url: string) => { this.registered.push(url); return this.registration; };
  addEventListener(_type: string, fn: Listener) { this.listeners.push(fn); }
  takeOver() { this.listeners.forEach((l) => l()); }
}

let container: FakeContainer;
const seen: string[] = [];
let stop: AbortController;
const record = (type: string) => window.addEventListener(type, () => seen.push(type), { signal: stop.signal });

beforeEach(() => {
  container = new FakeContainer();
  Object.defineProperty(navigator, 'serviceWorker', { value: container, configurable: true });
  seen.length = 0;
  stop = new AbortController();
  record(OFFLINE_READY_EVENT);
  record(UPDATE_READY_EVENT);
});
afterEach(() => { stop.abort(); Reflect.deleteProperty(navigator, 'serviceWorker'); });

describe('registerServiceWorker', () => {
  it('does nothing where service workers are unsupported', async () => {
    Reflect.deleteProperty(navigator, 'serviceWorker');
    await expect(registerServiceWorker()).resolves.toBeUndefined();
  });

  it('registers the worker from a relative URL by default', async () => {
    await registerServiceWorker();
    expect(container.registered).toEqual(['./sw.js']);
  });

  it('announces "ready offline" after the first install only', async () => {
    const worker = new FakeWorker();
    container.registration.installing = worker;
    await registerServiceWorker();
    worker.become('installing');
    expect(seen).toEqual([]);
    worker.become('installed');
    expect(seen).toEqual([OFFLINE_READY_EVENT]);
  });

  it('announces an update when a new version finishes installing beside a running one, and applies it on request', async () => {
    container.controller = {}; // an older version is in control
    await registerServiceWorker();
    const update = new FakeWorker();
    let detail: { apply(): void } | undefined;
    window.addEventListener(UPDATE_READY_EVENT, (e) => { detail = (e as CustomEvent).detail; }, { signal: stop.signal });
    container.registration.found(update);
    update.become('installed');
    expect(seen).toEqual([UPDATE_READY_EVENT]);
    expect(update.posted).toEqual([]); // nothing happens until the user agrees
    detail!.apply();
    expect(update.posted).toEqual([{ type: 'SKIP_WAITING' }]);
  });

  it('announces an update that was already waiting when the page opened', async () => {
    container.controller = {};
    container.registration.waiting = new FakeWorker();
    await registerServiceWorker();
    expect(seen).toEqual([UPDATE_READY_EVENT]);
  });

  it('reloads once when a new version takes over, but not when the first version claims the page', async () => {
    const reload = vi.fn();
    await registerServiceWorker({ reload });
    container.takeOver(); // first install claiming an uncontrolled page
    expect(reload).not.toHaveBeenCalled();

    const controlled = new FakeContainer();
    controlled.controller = {};
    Object.defineProperty(navigator, 'serviceWorker', { value: controlled, configurable: true });
    await registerServiceWorker({ reload });
    controlled.takeOver();
    controlled.takeOver();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
