import { useState, useCallback } from 'react';
import { validateApiKey } from '../utils/validation';
import { ValidationError } from '../types/errors';

const API_KEY_STORAGE_KEY = 'user_gemini_api_key';

/**
 * Custom hook for managing API Key with localStorage persistence and validation
 */
export function useApiKey() {
  const [apiKey, setApiKey] = useState<string>(() => {
    return localStorage.getItem(API_KEY_STORAGE_KEY) || '';
  });

  const updateApiKey = useCallback((key: string) => {
    // Allow empty key (user clearing it)
    if (key === '') {
      setApiKey('');
      localStorage.removeItem(API_KEY_STORAGE_KEY);
      return;
    }

    // Validate non-empty keys
    try {
      validateApiKey(key);
      setApiKey(key);
      localStorage.setItem(API_KEY_STORAGE_KEY, key);
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new ValidationError('API Key 格式无效', 'API Key');
    }
  }, []);

  return {
    apiKey,
    updateApiKey
  };
}
