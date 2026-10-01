import { describe, expect, it } from 'vitest';
import { hashFor, parseHash } from '../../src/ui/router';

describe('router', () => {
  it('parses tabs and the player route', () => {
    expect(parseHash('#/library')).toEqual({ name: 'library' });
    expect(parseHash('#/search')).toEqual({ name: 'search' });
    expect(parseHash('#/player/my-poem')).toEqual({ name: 'player', id: 'my-poem' });
  });

  it('falls back to home for empty, unknown or incomplete routes', () => {
    for (const h of ['', '#', '#/', '#/nope', '#/player', '#/player/']) expect(parseHash(h)).toEqual({ name: 'home' });
  });

  it('round-trips ids that need escaping', () => {
    const route = { name: 'player', id: 'a b/ç' } as const;
    expect(parseHash(hashFor(route))).toEqual(route);
  });
});
