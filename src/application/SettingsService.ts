import { sanitizeSettings } from '../domain';
import type { AppSettings, PracticeDefaults } from '../domain';
import type { SettingsRepository } from './repositories';

export type SettingsPatch = Partial<Omit<AppSettings, 'practiceDefaults'>> & {
  practiceDefaults?: Partial<PracticeDefaults>;
};

/** Reads and updates app settings. Invalid values are replaced with defaults, never stored. */
export class SettingsService {
  constructor(private readonly repo: SettingsRepository) {}

  get(): Promise<AppSettings> {
    return this.repo.load();
  }

  async update(patch: SettingsPatch): Promise<AppSettings> {
    const current = await this.repo.load();
    const merged = sanitizeSettings({
      ...current,
      ...patch,
      practiceDefaults: { ...current.practiceDefaults, ...patch.practiceDefaults },
    });
    await this.repo.save(merged);
    return merged;
  }
}
