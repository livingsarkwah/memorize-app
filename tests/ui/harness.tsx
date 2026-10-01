import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { buildServices } from '../../src/app/container';
import type { AppServices } from '../../src/app/container';
import type { AudioPort, CatalogSource, PackageReader } from '../../src/application';
import { SampleCatalog } from '../../src/infrastructure';
import { App } from '../../src/ui/App';
import { FakeAudio } from '../helpers/fakes';
import {
  FakeProbe, FakeReader, FakeWriter, FixedClock, MemoryLibraryRepository, MemoryPracticeStateRepository, MemorySettingsRepository, makeRawPackage,
} from '../helpers/memory';

/** Adapts the test FakeAudio (time moves only when told to) to the app's audio port. */
export const audioInstances: FakeAudio[] = [];

export interface HarnessOptions {
  reader?: PackageReader;
  catalog?: CatalogSource;
  createAudio?: () => AudioPort;
  clock?: FixedClock;
}

/** A full app with in-memory storage, a fast sample catalog and fake audio. */
export function setupApp(options: HarnessOptions = {}) {
  const libraryRepo = new MemoryLibraryRepository();
  const practiceRepo = new MemoryPracticeStateRepository();
  const settingsRepo = new MemorySettingsRepository();
  const clock = options.clock ?? new FixedClock(Date.now());
  let cleared = 0;
  const services: AppServices = buildServices({
    libraryRepo, practiceRepo, settingsRepo,
    data: { clearAll: async () => { cleared++; libraryRepo.items.clear(); libraryRepo.packages.clear(); practiceRepo.states.clear(); settingsRepo.stored = undefined; } },
    reader: options.reader ?? new FakeReader(makeRawPackage()),
    writer: new FakeWriter(),
    probe: new FakeProbe(30),
    catalog: options.catalog ?? new SampleCatalog({ stepMs: 0, steps: 3 }),
    createAudio: options.createAudio ?? (() => { const a = new FakeAudio(); audioInstances.push(a); return a; }),
    clock,
  });
  return { services, libraryRepo, practiceRepo, settingsRepo, clock, clearedCount: () => cleared };
}

export type Harness = ReturnType<typeof setupApp>;

/** Renders the app on an already prepared harness (e.g. after installing samples). */
export function mountApp(ctx: Harness, route = '') {
  location.hash = route;
  const user = userEvent.setup();
  const view = render(<App services={ctx.services} />);
  return { ...ctx, user, ...view };
}

export function renderApp(options: HarnessOptions = {}, route = '') {
  return mountApp(setupApp(options), route);
}

export { makeRawPackage };
