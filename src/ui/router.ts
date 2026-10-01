import { useEffect, useState } from 'react';

export type TabName = 'home' | 'library' | 'search' | 'settings';
export type Route = { name: TabName } | { name: 'player'; id: string };

export const TABS: readonly TabName[] = ['home', 'library', 'search', 'settings'];

/** '#/library' → { name: 'library' }; '#/player/my-poem' → { name: 'player', id: 'my-poem' }. Unknown → home. */
export function parseHash(hash: string): Route {
  const [name, ...rest] = hash.replace(/^#\/?/, '').split('/');
  if (name === 'player') {
    const id = decodeURIComponent(rest.join('/'));
    return id ? { name: 'player', id } : { name: 'home' };
  }
  return TABS.includes(name as TabName) ? { name: name as TabName } : { name: 'home' };
}

export function hashFor(route: Route): string {
  return route.name === 'player' ? `#/player/${encodeURIComponent(route.id)}` : `#/${route.name}`;
}

export function navigate(route: Route): void {
  location.hash = hashFor(route);
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(location.hash));
  useEffect(() => {
    const onChange = (): void => setRoute(parseHash(location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
