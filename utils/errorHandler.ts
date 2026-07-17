import {
  APIKeyError,
  NetworkError,
  SafetyFilterError,
  ImageProcessingError,
  ServerError,
  AppError,
  type ErrorType
} from '../types/errors.ts';
import type { GenerationErrorInfo } from '../types.ts';

/**
 * Extracts HTTP status code from error message
 */
function extractStatusCode(message: string): number | null {
  // Match patterns like "503", "status 503", "503 Service"
  const match = message.match(/\b(50[0-9]|40[0-9]|[45]\d{2})\b/);
  return match ? parseInt(match[0], 10) : null;
}

interface ApiErrorDetails {
  status?: number;
  code?: string;
  type?: string;
  requestId?: string;
  message: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object'
    ? value as Record<string, unknown>
    : null;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function extractApiErrorDetails(error: unknown): ApiErrorDetails | null {
  const record = asRecord(error);
  if (!record) return null;

  const nestedError = asRecord(record.error);
  const status = typeof record.status === 'number' ? record.status : undefined;
  const code = readString(record.code) ?? readString(nestedError?.code);
  const type = readString(record.type) ?? readString(nestedError?.type);
  const requestId =
    readString(record.requestID) ??
    readString(record.request_id) ??
    readString(nestedError?.request_id);
  const message =
    readString(nestedError?.message) ??
    readString(record.message) ??
    (nestedError ? JSON.stringify(nestedError) : 'API request failed');

  if (status === undefined && !code && !type && !requestId && !nestedError) {
    return null;
  }

  return { status, code, type, requestId, message };
}

function formatApiError(details: ApiErrorDetails): string {
  const metadata = [
    details.status !== undefined ? `HTTP ${details.status}` : undefined,
    details.code ? `code=${details.code}` : undefined,
    details.type ? `type=${details.type}` : undefined,
    details.requestId ? `request_id=${details.requestId}` : undefined
  ].filter((value): value is string => Boolean(value));

  return metadata.length > 0
    ? `${metadata.join(' | ')}\n${details.message}`
    : details.message;
}

export function serializeGenerationError(
  error: unknown,
  attempts: number
): GenerationErrorInfo {
  const apiDetails = extractApiErrorDetails(error);
  const rawMessage = apiDetails
    ? formatApiError(apiDetails)
    : error instanceof Error
      ? error.message
      : String(error);
  const normalized = rawMessage.toLowerCase();
  const statusCode = apiDetails?.status ?? extractStatusCode(rawMessage) ?? undefined;
  const code = apiDetails?.code;

  let kind: GenerationErrorInfo['kind'] = 'unknown';
  if (
    code === 'moderation_blocked' ||
    error instanceof SafetyFilterError ||
    normalized.includes('content blocked') ||
    normalized.includes('safety filter')
  ) {
    kind = 'moderation';
  } else if (
    error instanceof NetworkError ||
    normalized.includes('network') ||
    normalized.includes('connection') ||
    normalized.includes('fetch') ||
    normalized.includes('timeout')
  ) {
    kind = 'network';
  } else if (statusCode === 400 || statusCode === 422) {
    kind = 'invalid_request';
  } else if (statusCode !== undefined) {
    kind = 'http';
  }

  return {
    kind,
    message: rawMessage,
    statusCode,
    code,
    type: apiDetails?.type,
    requestId: apiDetails?.requestId,
    attempts,
    retryable:
      kind === 'network' ||
      statusCode === 429 ||
      (statusCode !== undefined && statusCode >= 500)
  };
}

/**
 * Classifies and converts raw errors into typed AppError instances
 */
export function classifyError(error: unknown): ErrorType {
  // Already classified
  if (error instanceof AppError) {
    return error;
  }

  const apiErrorDetails = extractApiErrorDetails(error);
  const errorMessage = apiErrorDetails
    ? formatApiError(apiErrorDetails)
    : error instanceof Error
      ? error.message
      : String(error);
  const errorLower = errorMessage.toLowerCase();

  // Extract status code
  const statusCode = apiErrorDetails?.status ?? extractStatusCode(errorMessage);

  // Server errors (5xx) - Check first before other patterns
  if (statusCode && statusCode >= 500 && statusCode < 600) {
    return new ServerError(errorMessage, statusCode);
  }

  // Structured API errors use stable fields from the response. Do not run
  // fuzzy keyword matching against their server-provided messages.
  if (apiErrorDetails) {
    if (statusCode === 401) {
      return new APIKeyError(errorMessage);
    }

    if (apiErrorDetails.code === 'moderation_blocked') {
      return new SafetyFilterError(errorMessage);
    }

    const code = apiErrorDetails.code || (statusCode ? `HTTP_${statusCode}` : 'API_ERROR');
    return new AppError(errorMessage, code, '❌ API 请求失败。');
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

  // Authentication errors. A 403 can also mean permissions or region restrictions.
  if (
    errorLower.includes('api key') ||
    errorLower.includes('api_key') ||
    errorLower.includes('unauthorized') ||
    statusCode === 401
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
    apiErrorDetails?.code === 'moderation_blocked' ||
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

  // Preserve HTTP failures instead of guessing their cause.
  if (statusCode) {
    const code = `HTTP_${statusCode}`;
    return new AppError(errorMessage, code, '❌ API 请求失败。');
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
  const detail = classifiedError.message;
  if (detail && detail !== classifiedError.userMessage) {
    return `${classifiedError.userMessage}\n\n${detail}`;
  }
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
