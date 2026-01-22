import {
  APIKeyError,
  NetworkError,
  SafetyFilterError,
  ImageProcessingError,
  ServerError,
  AppError,
  type ErrorType
} from '../types/errors';

/**
 * Extracts HTTP status code from error message
 */
function extractStatusCode(message: string): number | null {
  // Match patterns like "503", "status 503", "503 Service"
  const match = message.match(/\b(50[0-9]|40[0-9]|[45]\d{2})\b/);
  return match ? parseInt(match[0], 10) : null;
}

/**
 * Classifies and converts raw errors into typed AppError instances
 */
export function classifyError(error: unknown): ErrorType {
  // Already classified
  if (error instanceof AppError) {
    return error;
  }

  // Convert standard Error to string
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorLower = errorMessage.toLowerCase();

  // Extract status code
  const statusCode = extractStatusCode(errorMessage);

  // Server errors (5xx) - Check first before other patterns
  if (statusCode && statusCode >= 500 && statusCode < 600) {
    return new ServerError(errorMessage, statusCode);
  }

  // Explicit server error keywords
  if (
    errorLower.includes('503') ||
    errorLower.includes('502') ||
    errorLower.includes('504') ||
    errorLower.includes('500') ||
    errorLower.includes('service unavailable') ||
    errorLower.includes('bad gateway') ||
    errorLower.includes('gateway timeout') ||
    errorLower.includes('no available channels')
  ) {
    return new ServerError(errorMessage, statusCode || undefined);
  }

  // API Key errors (401, 403)
  if (
    errorLower.includes('api key') ||
    errorLower.includes('api_key') ||
    errorLower.includes('unauthorized') ||
    errorLower.includes('401') ||
    errorLower.includes('403')
  ) {
    return new APIKeyError(errorMessage);
  }

  // Network errors
  if (
    errorLower.includes('network') ||
    errorLower.includes('fetch') ||
    errorLower.includes('cors') ||
    errorLower.includes('timeout') ||
    errorLower.includes('connection')
  ) {
    return new NetworkError(errorMessage);
  }

  // Safety filter errors
  if (
    errorLower.includes('safety') ||
    errorLower.includes('blocked') ||
    errorLower.includes('filter')
  ) {
    return new SafetyFilterError(errorMessage);
  }

  // Image processing errors - Only if not already classified as server error
  if (
    errorLower.includes('invalid data') ||
    errorLower.includes('base64')
  ) {
    return new ImageProcessingError(errorMessage);
  }

  // Generic app error
  return new AppError(
    errorMessage,
    'UNKNOWN_ERROR',
    '❌ 发生未知错误，请重试。'
  );
}

/**
 * Gets user-friendly error message from any error
 */
export function getUserErrorMessage(error: unknown): string {
  const classifiedError = classifyError(error);
  return classifiedError.userMessage;
}

/**
 * Logs error for debugging (only in development)
 */
export function logError(context: string, error: unknown): void {
  if (import.meta.env.DEV) {
    const classifiedError = classifyError(error);
    // Only log in development mode
    console.error(`[${context}]`, {
      name: classifiedError.name,
      code: classifiedError.code,
      message: classifiedError.message,
      userMessage: classifiedError.userMessage
    });
  }
}
