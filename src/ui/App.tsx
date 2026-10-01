import { useEffect, useRef } from 'react';
import type { AppServices } from '../app/container';
import { AppStateProvider } from './AppState';
import { DialogHost, ToastHost } from './components/Feedback';
import { Icon } from './components/Icon';
import type { IconName } from './components/Icon';
import { Logo } from './components/Cover';
import { PlayerScreen } from './player/PlayerScreen';
import { TABS, useRoute } from './router';
import type { Route, TabName } from './router';
import { HomeScreen } from './screens/Home';
import { LibraryScreen } from './screens/Library';
import { SearchScreen } from './screens/Search';
import { SettingsScreen } from './screens/Settings';
import { capitalize } from './format';

const TAB_ICONS: Record<TabName, IconName> = { home: 'home', library: 'library', search: 'search', settings: 'settings' };

export function App({ services }: { services: AppServices }) {
  return (
    <AppStateProvider services={services}>
      <Shell services={services} />
    </AppStateProvider>
  );
}

function Shell({ services }: { services: AppServices }) {
  const route = useRoute();
  const main = useRef<HTMLElement>(null);
  const lastTab = useRef<Route>({ name: 'home' });
  const first = useRef(true);
  if (route.name !== 'player') lastTab.current = route;

  // On each navigation: reset scroll, move focus to the page heading, update the tab title.
  useEffect(() => {
    document.title = route.name === 'player' ? 'Memorize' : `${capitalize(route.name)} · Memorize`;
    main.current?.scrollTo?.({ top: 0 });
    if (first.current) { first.current = false; return; }
    if (route.name !== 'player') {
      const heading = main.current?.querySelector<HTMLElement>('h1');
      if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
    }
  }, [route.name]);

  return (
    <div id="app" className={route.name === 'player' ? 'in-player' : undefined}>
      <div className="frame">
        <main id="main" ref={main} tabIndex={-1}>
          {route.name === 'home' && <HomeScreen />}
          {route.name === 'library' && <LibraryScreen />}
          {route.name === 'search' && <SearchScreen />}
          {route.name === 'settings' && <SettingsScreen />}
          {route.name === 'player' && <PlayerScreen key={route.id} services={services} itemId={route.id} backTo={lastTab.current} />}
        </main>
        <nav className="tabs" aria-label="Main">
          <div className="brand"><Logo />Memorize</div>
          {TABS.map((tab) => (
            <a key={tab} href={`#/${tab}`} aria-current={route.name === tab ? 'page' : undefined}>
              <Icon name={TAB_ICONS[tab]} />
              {capitalize(tab)}
            </a>
          ))}
        </nav>
      </div>
      <ToastHost />
      <DialogHost />
    </div>
  );
}
