/**
 * localStorage keys. The app was named NeuralGauge until Oct 2026, so values saved
 * under the old keys are moved to the new ones the first time CH-PIB starts.
 */
export const STORAGE_KEYS = {
  config: 'chpibConfig',
  presets: 'chpibPresets',
  sessions: 'chpibSessions',
  aiProvider: 'chpibAIProvider',
} as const;

const LEGACY_KEYS: Record<keyof typeof STORAGE_KEYS, string> = {
  config: 'neuralgaugeConfig',
  presets: 'neuralgaugePresets',
  sessions: 'neuralgaugeSessions',
  aiProvider: 'neuralgaugeAIProvider',
};

/**
 * Moves NeuralGauge-era values to the CH-PIB keys. A value already saved under a new
 * key is never overwritten, and an old value is only removed once it has been copied.
 */
export function migrateLegacyStorage(storage: Storage = localStorage): void {
  for (const name of Object.keys(STORAGE_KEYS) as (keyof typeof STORAGE_KEYS)[]) {
    try {
      const legacy = storage.getItem(LEGACY_KEYS[name]);
      if (legacy === null || storage.getItem(STORAGE_KEYS[name]) !== null) continue;
      storage.setItem(STORAGE_KEYS[name], legacy);
      storage.removeItem(LEGACY_KEYS[name]);
    } catch (e) {
      console.error(`Failed to move saved ${name} to its new key`, e);
    }
  }
}
