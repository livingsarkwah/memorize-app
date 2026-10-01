import { describe, expect, it } from 'vitest';
import { SettingsService } from '../../src/application';
import { DEFAULT_SETTINGS } from '../../src/domain';
import { MemorySettingsRepository } from '../helpers/memory';

describe('SettingsService', () => {
  it('starts with the defaults', async () => {
    expect(await new SettingsService(new MemorySettingsRepository()).get()).toEqual(DEFAULT_SETTINGS);
  });

  it('merges a patch and persists it', async () => {
    const repo = new MemorySettingsRepository();
    const service = new SettingsService(repo);
    const updated = await service.update({ theme: 'dark', showTranslation: true });
    expect(updated).toMatchObject({ theme: 'dark', showTranslation: true, textSize: 'm' });
    expect(repo.stored).toEqual(updated);
    expect(await service.get()).toEqual(updated);
  });

  it('patches nested practice defaults without losing the others', async () => {
    const service = new SettingsService(new MemorySettingsRepository());
    const updated = await service.update({ practiceDefaults: { count: 9 } });
    expect(updated.practiceDefaults).toEqual({ rate: 1, pause: 2, count: 9 });
  });

  it('replaces invalid values instead of storing them', async () => {
    const repo = new MemorySettingsRepository();
    const updated = await new SettingsService(repo).update({ theme: 'neon' as never, practiceDefaults: { rate: 9 } });
    expect(updated.theme).toBe('system');
    expect(updated.practiceDefaults.rate).toBe(1);
    expect(repo.stored).toEqual(updated);
  });
});
