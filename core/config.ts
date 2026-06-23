import { AppSettings, ProviderConfig } from '../types';

// Centralized defaults for agent/skill usage. Fill in your keys here if desired.
export const DEFAULT_PROVIDER_CONFIG: ProviderConfig = {
  provider: 'openai',
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-image-2'
};

export const DEFAULT_SETTINGS: AppSettings = {
  batchSize: 2,
  aspectRatio: 'Auto',
  resolution: '1K',
  providerConfig: DEFAULT_PROVIDER_CONFIG
};

export function resolveProviderConfig(
  override?: Partial<ProviderConfig>,
  fallback?: Partial<ProviderConfig>
): ProviderConfig {
  return {
    ...DEFAULT_PROVIDER_CONFIG,
    ...(fallback ?? {}),
    ...(override ?? {})
  };
}

export function resolveSettings(
  settings?: Partial<AppSettings>,
  providerOverride?: Partial<ProviderConfig>
): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...(settings ?? {}),
    providerConfig: resolveProviderConfig(providerOverride, settings?.providerConfig)
  };
}
