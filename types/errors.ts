/**
 * Custom error types for better error handling and user feedback
 */

export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly userMessage: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class APIKeyError extends AppError {
  constructor(message: string = 'Invalid API Key', provider?: string) {
    const userMessage = provider
      ? `⚠️ ${provider} API Key 无效或未配置。请在右上角 🔑 设置中配置有效的 API Key。`
      : '⚠️ API Key 无效或未配置。请在右上角 🔑 设置中配置有效的 API Key。';

    super(message, 'API_KEY_ERROR', userMessage);
    this.name = 'APIKeyError';
  }
}

export class NetworkError extends AppError {
  constructor(message: string = 'Network request failed') {
    super(
      message,
      'NETWORK_ERROR',
      '🌐 网络请求失败，请检查网络连接后重试。'
    );
    this.name = 'NetworkError';
  }
}

export class SafetyFilterError extends AppError {
  constructor(message: string = 'Content blocked by safety filters') {
    super(
      message,
      'SAFETY_FILTER_ERROR',
      '🛡️ 内容被安全过滤器拦截，请尝试修改提示词。'
    );
    this.name = 'SafetyFilterError';
  }
}

export class ImageProcessingError extends AppError {
  constructor(message: string = 'Image processing failed') {
    super(
      message,
      'IMAGE_PROCESSING_ERROR',
      '🖼️ 图片处理失败，请检查图片格式和大小。'
    );
    this.name = 'ImageProcessingError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, field?: string) {
    const userMessage = field
      ? `⚠️ ${field} 验证失败: ${message}`
      : `⚠️ 验证失败: ${message}`;

    super(message, 'VALIDATION_ERROR', userMessage);
    this.name = 'ValidationError';
  }
}

export class ServerError extends AppError {
  constructor(message: string = 'Server error', statusCode?: number) {
    let userMessage = '🔧 服务器错误，请稍后重试。';

    if (statusCode === 503) {
      userMessage = '⚠️ 服务暂时不可用，可能是模型过载或维护中，请稍后重试。';
    } else if (statusCode === 502 || statusCode === 504) {
      userMessage = '⚠️ 网关超时，服务器响应缓慢，请稍后重试。';
    } else if (statusCode === 500) {
      userMessage = '🔧 服务器内部错误，请稍后重试。';
    } else if (statusCode && statusCode >= 500) {
      userMessage = `🔧 服务器错误 (${statusCode})，请稍后重试。`;
    }

    super(message, 'SERVER_ERROR', userMessage);
    this.name = 'ServerError';
  }
}

export type ErrorType =
  | APIKeyError
  | NetworkError
  | SafetyFilterError
  | ImageProcessingError
  | ValidationError
  | ServerError
  | AppError;
