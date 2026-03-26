import { useState, useCallback } from 'react';
import { AppSettings, ProviderConfig } from '../types';
import { validateBatchSize } from '../utils/validation';

/**
 * Custom hook for managing app settings with validation
 */
export function useSettings(initialSettings: AppSettings) {
  const [settings, setSettings] = useState<AppSettings>(initialSettings);

  const updateSettings = useCallback((updates: Partial<AppSettings>) => {
    setSettings((prev) => {
      const newSettings = { ...prev, ...updates };

      // Validate batch size if it was updated
      if (updates.batchSize !== undefined) {
        try {
          validateBatchSize(updates.batchSize);
        } catch (error) {
          // Keep previous valid value on validation failure
          return prev;
        }
      }

      return newSettings;
    });
  }, []);

  const updateProviderConfig = useCallback((providerConfig: ProviderConfig) => {
    setSettings((prev) => ({
      ...prev,
      providerConfig
    }));
  }, []);

  return {
    settings,
    updateSettings,
    updateProviderConfig
  };
}
