import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../../src/domain';

describe('sanitizeSettings', () => {
  it('returns the defaults for missing or unusable input', () => {
    for (const bad of [undefined, null, 'x', 42, [], {}]) expect(sanitizeSettings(bad)).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid values', () => {
    const custom = { theme: 'dark', textSize: 'l', titles: 'native', showTranslation: true, practiceDefaults: { rate: 0.75, pause: 'auto', count: 0 } };
    expect(sanitizeSettings(custom)).toEqual(custom);
  });

  it('replaces only the invalid fields', () => {
    const result = sanitizeSettings({ theme: 'neon', textSize: 's', titles: 42, showTranslation: 'yes', practiceDefaults: { rate: 3, pause: 5, count: 200 } });
    expect(result).toEqual({
      ...DEFAULT_SETTINGS,
      textSize: 's',
      practiceDefaults: { rate: 1, pause: 5, count: 3 },
    });
  });

  it('rejects fractional or negative repeat counts', () => {
    expect(sanitizeSettings({ practiceDefaults: { count: 2.5 } }).practiceDefaults.count).toBe(3);
    expect(sanitizeSettings({ practiceDefaults: { count: -1 } }).practiceDefaults.count).toBe(3);
  });

  it('never returns the shared defaults object itself', () => {
    const a = sanitizeSettings(null);
    a.practiceDefaults.count = 99;
    expect(sanitizeSettings(null).practiceDefaults.count).toBe(3);
  });
});
