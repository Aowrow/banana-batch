import OpenAI from 'openai';
import { Message, GeneratedImage, AppSettings, UploadedImage, AspectRatio, Resolution } from '../types';
import { generateUUID } from '../utils/uuid';
import { logError } from '../utils/errorHandler';
import {
  validateApiKey,
  validatePrompt,
  VALIDATION_LIMITS
} from '../utils/validation';
import {
  ImageProcessingError,
  SafetyFilterError,
  NetworkError
} from '../types/errors';
import { StreamCallbacks } from './geminiService';

const MAX_CONCURRENT_REQUESTS = 10;
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Extracts base64 data from a data URI safely
 */
function extractBase64Data(
  dataUri: string
): { mimeType: string; base64Data: string } | null {
  const base64Match = dataUri.match(/^data:([^;]+);base64,(.+)$/);
  if (!base64Match) {
    return null;
  }

  const [, mimeTypeFromData, base64Data] = base64Match;
  const finalMimeType = mimeTypeFromData || 'image/png';

  if (!base64Data || base64Data.length === 0) {
    return null;
  }

  return { mimeType: finalMimeType, base64Data };
}

function shouldUseGeminiCompat(baseUrl: string): boolean {
  const normalized = baseUrl.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.includes('generativelanguage.googleapis.com')) return true;
  if (normalized.includes('/openai')) return true;
  return false;
}

function shouldUseChatCompletionsAPI(model: string): boolean {
  const normalized = model.toLowerCase();
  // nanobanana and Gemini models use Chat Completions API
  if (normalized.includes('nanobanana')) return true;
  if (normalized.includes('gemini')) return true;
  return false;
}

function shouldUseImagesAPI(model: string): boolean {
  const normalized = model.toLowerCase();
  // gpt-image-2 uses Images API
  if (normalized.includes('gpt-image-2')) return true;
  return false;
}

function hasReferenceImages(
  history: Message[],
  uploadedImages: UploadedImage[] | undefined
): boolean {
  if (uploadedImages && uploadedImages.length > 0) return true;
  return history.some(
    (msg) =>
      msg.role === 'model' &&
      !!msg.selectedImageId &&
      !!msg.images?.some((img) => img.id === msg.selectedImageId && img.status === 'success')
  );
}

function mapAspectRatioToOpenAISize(aspectRatio: AspectRatio | undefined, model: string): string {
  const normalizedModel = model.toLowerCase();
  const useDalleSizes = normalizedModel.includes('dall-e-3');
  const isGptImage2 = normalizedModel.includes('gpt-image-2');

  if (!aspectRatio || aspectRatio === 'Auto') {
    return '1024x1024';
  }

  const [width, height] = aspectRatio.split(':').map(Number);
  if (!width || !height || width === height) {
    return '1024x1024';
  }

  // gpt-image-2 supports more sizes
  if (isGptImage2) {
    if (width < height) {
      // Portrait
      return '1024x1536';
    }
    // Landscape
    return '1536x1024';
  }

  if (width < height) {
    return useDalleSizes ? '1024x1792' : '1024x1536';
  }

  return useDalleSizes ? '1792x1024' : '1536x1024';
}

function mapResolutionToOpenAIQuality(
  resolution: Resolution | undefined,
  model: string
): 'standard' | 'hd' | 'low' | 'medium' | 'high' | 'auto' | undefined {
  const normalizedModel = model.toLowerCase();
  const isDalle3 = normalizedModel.includes('dall-e-3');
  const isGptImage2 = normalizedModel.includes('gpt-image-2');

  if (isDalle3) {
    return resolution && resolution !== '1K' ? 'hd' : 'standard';
  }

  if (isGptImage2) {
    // gpt-image-2 uses: low, medium, high, auto
    if (!resolution || resolution === '1K') return 'low';
    if (resolution === '2K') return 'medium';
    return 'high'; // 4K or higher
  }

  if (!resolution || resolution === '1K') return 'auto';
  return 'high';
}

function inferImageMimeTypeFromUrl(url: string): string {
  const cleanUrl = url.split('?')[0];
  const ext = cleanUrl.split('.').pop()?.toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return 'image/png';
}

/**
 * Collects selected model images to be used as input for the current request.
 */
function collectSelectedImages(messages: Message[]): OpenAI.Chat.ChatCompletionContentPart[] {
  const selectedImages: OpenAI.Chat.ChatCompletionContentPart[] = [];

  for (const msg of messages) {
    if (msg.role !== 'model' || !msg.selectedImageId || !msg.images) {
      continue;
    }

    const selectedImg = msg.images.find((img) => img.id === msg.selectedImageId);
    if (!selectedImg || selectedImg.status !== 'success') {
      continue;
    }

    const imageData = extractBase64Data(selectedImg.data);
    if (!imageData) {
      continue;
    }

    const estimatedSizeMB =
      (imageData.base64Data.length * 3) / 4 / (1024 * 1024);
    if (estimatedSizeMB > VALIDATION_LIMITS.MAX_IMAGE_SIZE_MB) {
      logError(
        'Image Processing',
        new ImageProcessingError(
          `Selected image ${selectedImg.id} is too large (${estimatedSizeMB.toFixed(2)}MB)`
        )
      );
      continue;
    }

    selectedImages.push({
      type: 'image_url',
      image_url: {
        url: selectedImg.data
      }
    });
  }

  return selectedImages;
}

/**
 * Constructs the conversation history formatted for the OpenAI API.
 * Intentionally empty: prior text is not carried forward.
 */
function buildHistory(_messages: Message[]): OpenAI.Chat.ChatCompletionMessageParam[] {
  return [];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Converts base64 data URI to Blob for form upload
 */
function dataURItoBlob(dataURI: string): Blob {
  const byteString = atob(dataURI.split(',')[1]);
  const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: mimeString });
}

/**
 * Generates images using gpt-image-2 image edit endpoint
 */
async function generateImageEditGptImage2(
  openai: OpenAI,
  model: string,
  prompt: string,
  history: Message[],
  uploadedImages: UploadedImage[] | undefined,
  settings: AppSettings,
  callbacks: StreamCallbacks,
  signal: AbortSignal
): Promise<void> {
  if (!prompt || prompt.trim().length === 0) {
    throw new ImageProcessingError('Prompt is required for gpt-image-2 image editing.');
  }

  // Collect reference images
  const referenceImages: { data: string; mimeType: string }[] = [];

  // Add uploaded images
  if (uploadedImages && uploadedImages.length > 0) {
    for (const img of uploadedImages) {
      const imageData = extractBase64Data(img.data);
      if (imageData) {
        referenceImages.push({
          data: img.data,
          mimeType: imageData.mimeType
        });
      }
    }
  }

  // Add selected images from history
  for (const msg of history) {
    if (msg.role !== 'model' || !msg.selectedImageId || !msg.images) {
      continue;
    }
    const selectedImg = msg.images.find((img) => img.id === msg.selectedImageId);
    if (selectedImg && selectedImg.status === 'success') {
      const imageData = extractBase64Data(selectedImg.data);
      if (imageData) {
        referenceImages.push({
          data: selectedImg.data,
          mimeType: imageData.mimeType
        });
      }
    }
  }

  if (referenceImages.length === 0) {
    throw new ImageProcessingError('No reference images found for image editing.');
  }

  const size = mapAspectRatioToOpenAISize(settings.aspectRatio, model);
  const quality = mapResolutionToOpenAIQuality(settings.resolution, model);

  console.log('[Images Edit API] Request params:', {
    model,
    prompt: prompt.substring(0, 50) + '...',
    n: settings.batchSize,
    size,
    quality,
    imageCount: referenceImages.length
  });

  let attempt = 0;
  let response: OpenAI.ImagesResponse | null = null;

  while (attempt <= MAX_RETRIES && !response) {
    if (signal.aborted) return;

    // Per-attempt timeout that composes with the user's abort signal
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);
    const onUserAbort = () => timeoutController.abort();
    signal.addEventListener('abort', onUserAbort);

    try {
      // Build FormData for multipart/form-data request
      const formData = new FormData();
      formData.append('model', model);
      formData.append('prompt', prompt);
      formData.append('n', settings.batchSize.toString());
      formData.append('size', size);
      if (quality) {
        formData.append('quality', quality);
      }
      formData.append('response_format', 'b64_json');

      // Add reference images as 'image[]' array (gpt-image-2 supports up to 16 images)
      for (let i = 0; i < referenceImages.length; i++) {
        const refImg = referenceImages[i];
        const blob = dataURItoBlob(refImg.data);
        // Map mimeType to a server-accepted extension (png/webp/jpg)
        const rawExt = (refImg.mimeType.split('/')[1] || 'png').toLowerCase();
        const ext = rawExt === 'jpeg' ? 'jpg' : rawExt;
        formData.append('image[]', blob, `image${i}.${ext}`);
      }

      // Use fetch directly for multipart/form-data
      const rawBaseUrl = openai.baseURL || 'https://gptproto.com/v1';
      const baseUrl = rawBaseUrl.replace(/\/+$/, '');
      const url = `${baseUrl}/images/edits`;

      const fetchResponse = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openai.apiKey}`
        },
        body: formData,
        signal: timeoutController.signal
      });

      if (!fetchResponse.ok) {
        const errorText = await fetchResponse.text();
        throw new Error(`HTTP ${fetchResponse.status}: ${errorText}`);
      }

      response = await fetchResponse.json();

      console.log('[Images Edit API] Response received:', {
        hasData: !!response?.data,
        dataLength: response?.data?.length
      });
    } catch (error) {
      attempt++;

      // Distinguish user abort from timeout
      const userAborted = signal.aborted;
      const timedOut = !userAborted && timeoutController.signal.aborted;

      if (!userAborted) {
        if (timedOut) {
          logError(`OpenAI Image Edit API Attempt ${attempt}`, new NetworkError(`Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`));
        } else if (
          error instanceof Error &&
          (error.message.includes('fetch') || error.message.includes('network'))
        ) {
          logError(`OpenAI Image Edit API Attempt ${attempt}`, new NetworkError(error.message));
        } else {
          logError(`OpenAI Image Edit API Attempt ${attempt}`, error);
        }
      }

      if (attempt <= MAX_RETRIES && !userAborted) {
        const waitTime = 1000 * Math.pow(2, attempt - 1);
        await delay(waitTime);
      }
    } finally {
      clearTimeout(timeoutId);
      signal.removeEventListener('abort', onUserAbort);
    }
  }

  if (!response) {
    throw new ImageProcessingError('No response from OpenAI image edit API.');
  }

  const images = response.data || [];
  if (images.length === 0) {
    throw new ImageProcessingError('No image data in response');
  }

  let completed = 0;
  for (const item of images) {
    if (signal.aborted) return;

    let imageData: string | undefined;
    let mimeType = 'image/png';

    if ('b64_json' in item && item.b64_json) {
      imageData = `data:image/png;base64,${item.b64_json}`;
      console.log('[Images Edit API] Found b64_json image:', imageData.substring(0, 50));
    } else if ('url' in item && item.url) {
      imageData = item.url;
      mimeType = inferImageMimeTypeFromUrl(item.url);
      console.log('[Images Edit API] Found URL image:', imageData);
    }

    if (imageData) {
      callbacks.onImage({
        id: generateUUID(),
        data: imageData,
        mimeType,
        status: 'success'
      });
      completed++;
      callbacks.onProgress(completed, settings.batchSize);
    }
  }

  if (completed === 0) {
    throw new ImageProcessingError('No image data in response');
  }
}

/**
 * Generates images using OpenAI-compatible API with custom baseURL support
 */
export async function generateImageBatchStreamOpenAI(
  apiKey: string,
  baseUrl: string,
  model: string,
  prompt: string,
  history: Message[],
  settings: AppSettings,
  uploadedImages: UploadedImage[] | undefined,
  callbacks: StreamCallbacks,
  signal: AbortSignal
): Promise<void> {
  // Validate API key
  validateApiKey(apiKey);

  // Validate prompt if provided
  if (prompt) {
    validatePrompt(prompt);
  }

  // Normalize base URL based on model
  let normalizedBaseUrl = baseUrl;
  const normalizedModel = model.toLowerCase();

  // For gpt-image-2, ensure base URL ends with /v1 (uses Images API)
  if (normalizedModel.includes('gpt-image-2')) {
    normalizedBaseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    if (!normalizedBaseUrl.endsWith('/v1')) {
      normalizedBaseUrl = normalizedBaseUrl + '/v1';
    }
  }

  console.log('[OpenAI Service] Configuration:', {
    originalBaseUrl: baseUrl,
    normalizedBaseUrl,
    model,
    batchSize: settings.batchSize,
    aspectRatio: settings.aspectRatio,
    resolution: settings.resolution
  });

  // Initialize OpenAI client with custom baseURL
  const openai = new OpenAI({
    apiKey,
    baseURL: normalizedBaseUrl,
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: 0, // We handle retries ourselves
    dangerouslyAllowBrowser: true // Required for browser usage
  });

  const useGeminiCompat = shouldUseGeminiCompat(baseUrl);
  const useChatCompletions = shouldUseChatCompletionsAPI(model);
  const useImagesAPI = shouldUseImagesAPI(model);

  // Route 1: Standard OpenAI Images API (for gpt-image-2, dall-e-3, etc.)
  if (useImagesAPI || (!useGeminiCompat && !useChatCompletions)) {
    const hasRefImages = hasReferenceImages(history, uploadedImages);

    // If gpt-image-2 with reference images, use image edit endpoint
    if (useImagesAPI && hasRefImages) {
      return await generateImageEditGptImage2(
        openai,
        model,
        prompt,
        history,
        uploadedImages,
        settings,
        callbacks,
        signal
      );
    }

    // Standard text-to-image flow
    if (!prompt || prompt.trim().length === 0) {
      throw new ImageProcessingError('Prompt is required for OpenAI image generation.');
    }

    // For non-gpt-image-2 models (like dall-e-3), check reference images
    if (!useImagesAPI && hasRefImages) {
      throw new ImageProcessingError(
        'OpenAI image generation does not support reference images in this mode.'
      );
    }

    const normalizedModel = model.toLowerCase();
    const size = mapAspectRatioToOpenAISize(settings.aspectRatio, model);
    const quality = mapResolutionToOpenAIQuality(settings.resolution, model);
    const responseFormat = normalizedModel.includes('dall-e') ? 'b64_json' : 'b64_json';

    console.log('[Images API] Request params:', {
      model,
      prompt: prompt.substring(0, 50) + '...',
      n: settings.batchSize,
      size,
      quality,
      responseFormat
    });

    let attempt = 0;
    let response: OpenAI.ImagesResponse | null = null;

    while (attempt <= MAX_RETRIES && !response) {
      if (signal.aborted) return;

      try {
        response = await openai.images.generate({
          model,
          prompt,
          n: settings.batchSize,
          size,
          ...(quality ? { quality } : {}),
          response_format: responseFormat
        });

        console.log('[Images API] Response received:', {
          hasData: !!response.data,
          dataLength: response.data?.length
        });
      } catch (error) {
        attempt++;

        if (!signal.aborted) {
          if (
            error instanceof Error &&
            (error.message.includes('fetch') || error.message.includes('network'))
          ) {
            logError(`OpenAI Image API Attempt ${attempt}`, new NetworkError(error.message));
          } else {
            logError(`OpenAI Image API Attempt ${attempt}`, error);
          }
        }

        if (attempt <= MAX_RETRIES && !signal.aborted) {
          const waitTime = 1000 * Math.pow(2, attempt - 1);
          await delay(waitTime);
        }
      }
    }

    if (!response) {
      throw new ImageProcessingError('No response from OpenAI image generation.');
    }

    const images = response.data || [];
    if (images.length === 0) {
      throw new ImageProcessingError('No image data in response');
    }

    let completed = 0;
    for (const item of images) {
      if (signal.aborted) return;

      let imageData: string | undefined;
      let mimeType = 'image/png';

      if ('b64_json' in item && item.b64_json) {
        imageData = `data:image/png;base64,${item.b64_json}`;
        console.log('[Images API] Found b64_json image:', imageData.substring(0, 50));
      } else if ('url' in item && item.url) {
        imageData = item.url;
        mimeType = inferImageMimeTypeFromUrl(item.url);
        console.log('[Images API] Found URL image:', imageData);
      }

      if (imageData) {
        callbacks.onImage({
          id: generateUUID(),
          data: imageData,
          mimeType,
          status: 'success'
        });
        completed++;
        callbacks.onProgress(completed, settings.batchSize);
      }
    }

    if (completed === 0) {
      throw new ImageProcessingError('No image data in response');
    }

    return;
  }

  // Route 2: Chat Completions API flow (for nanobanana, Gemini models)
  const formattedHistory = buildHistory(history);

  // Build user message parts
  const userContent: OpenAI.Chat.ChatCompletionContentPart[] = [];

  // Add text first
  if (prompt) {
    userContent.push({ type: 'text', text: prompt });
  }

  const selectedImages = collectSelectedImages(history);
  if (selectedImages.length > 0) {
    userContent.push(...selectedImages);
  }

  // Process and validate images
  if (uploadedImages && uploadedImages.length > 0) {
    for (const img of uploadedImages) {
      const imageData = extractBase64Data(img.data);
      if (!imageData) {
        continue; // Skip invalid images
      }

      // Estimate image size
      const estimatedSizeMB =
        (imageData.base64Data.length * 3) / 4 / (1024 * 1024);

      if (estimatedSizeMB > VALIDATION_LIMITS.MAX_IMAGE_SIZE_MB) {
        logError(
          'Image Processing',
          new ImageProcessingError(
            `Image ${img.id} is too large (${estimatedSizeMB.toFixed(2)}MB)`
          )
        );
        continue;
      }

      userContent.push({
        type: 'image_url',
        image_url: {
          url: img.data // Use full data URI
        }
      });
    }
  }

  // Ensure at least one part exists
  if (userContent.length === 0) {
    throw new ImageProcessingError(
      'At least one image or text prompt is required.'
    );
  }

  // Build extra_body for image generation settings
  const extraBody: Record<string, unknown> = {};

  // Only add modalities for Gemini-compatible endpoints
  if (useGeminiCompat) {
    extraBody.modalities = ['image'];
  }

  // Set aspect ratio if specified
  if (settings.aspectRatio && settings.aspectRatio !== 'Auto') {
    extraBody.aspect_ratio = settings.aspectRatio;
  }

  // Set resolution if specified
  if (settings.resolution) {
    extraBody.resolution = settings.resolution;
  }

  // Shared task queue
  const taskQueue = Array.from({ length: settings.batchSize }, (_, i) => i);
  let completedCount = 0;

  // Worker function
  const worker = async (workerId: number): Promise<void> => {
    while (taskQueue.length > 0) {
      if (signal.aborted) return;

      const index = taskQueue.shift();
      if (index === undefined) break;

      let attempt = 0;
      let success = false;

      while (attempt <= MAX_RETRIES && !success) {
        if (signal.aborted) return;

        try {
          const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
            ...formattedHistory,
            { role: 'user', content: userContent }
          ];

          const response = await openai.chat.completions.create({
            model,
            messages,
            // Only add extra_body if there are parameters (for Gemini-compatible endpoints)
            ...(Object.keys(extraBody).length > 0 ? {
              // @ts-ignore - extra_body is not in types but supported by API
              extra_body: extraBody
            } : {})
          });

          // Debug: Log the full response for troubleshooting
          console.log('[OpenAI API Response]', {
            model,
            hasChoices: !!response.choices,
            choicesLength: response.choices?.length,
            firstChoice: response.choices?.[0],
            fullResponse: response
          });

          const choice = response.choices?.[0];
          if (!choice) {
            console.error('[OpenAI API] No choice in response:', response);
            throw new ImageProcessingError('No choice returned from API');
          }

          // Check for content filtering
          if (choice.finish_reason === 'content_filter') {
            throw new SafetyFilterError('Content blocked by safety filters');
          }

          const message = choice.message;
          if (!message?.content) {
            console.error('[OpenAI API] No content in message:', { choice, message });
            throw new ImageProcessingError('No content in response');
          }

          // Extract image and text from response
          let foundImage = false;

          console.log('[Content Type]', {
            isString: typeof message.content === 'string',
            isArray: Array.isArray(message.content),
            content: message.content
          });

          // Handle different content formats
          if (typeof message.content === 'string') {
            // Try to extract data URI from string content
            const dataUriMatch = message.content.match(
              /data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/
            );
            if (dataUriMatch) {
              console.log('[Found image in string]', dataUriMatch[0].substring(0, 100));
              const img: GeneratedImage = {
                id: generateUUID(),
                data: dataUriMatch[0],
                mimeType: dataUriMatch[0].split(';')[0].split(':')[1],
                status: 'success'
              };
              callbacks.onImage(img);
              foundImage = true;
            } else {
              // Text response - might contain URL or other format
              console.log('[Text response]', message.content);
              // Check if it's a URL
              if (message.content.startsWith('http://') || message.content.startsWith('https://')) {
                console.log('[Found image URL]', message.content);
                const img: GeneratedImage = {
                  id: generateUUID(),
                  data: message.content,
                  mimeType: inferImageMimeTypeFromUrl(message.content),
                  status: 'success'
                };
                callbacks.onImage(img);
                foundImage = true;
              } else {
                callbacks.onText(message.content);
              }
            }
          } else if (Array.isArray(message.content)) {
            // Handle array content
            console.log('[Array content]', message.content.length, 'parts');
            for (const part of message.content) {
              if (typeof part === 'object' && part !== null) {
                if ('image_url' in part && part.image_url) {
                  const imageUrl =
                    typeof part.image_url === 'string'
                      ? part.image_url
                      : part.image_url.url;

                  if (imageUrl) {
                    console.log('[Found image_url]', imageUrl.substring(0, 100));
                    const img: GeneratedImage = {
                      id: generateUUID(),
                      data: imageUrl,
                      mimeType: imageUrl.split(';')[0].split(':')[1] || 'image/png',
                      status: 'success'
                    };
                    callbacks.onImage(img);
                    foundImage = true;
                  }
                } else if ('text' in part && part.text) {
                  console.log('[Found text part]', part.text);
                  callbacks.onText(part.text);
                }
              }
            }
          }

          if (foundImage) {
            success = true;
          } else {
            console.error('[No image found in response]', { message });
            throw new ImageProcessingError('No image data in response');
          }
        } catch (error) {
          attempt++;

          if (!signal.aborted) {
            // Classify network errors
            if (
              error instanceof Error &&
              (error.message.includes('fetch') ||
                error.message.includes('network'))
            ) {
              logError(
                `Worker ${workerId} - Image ${index + 1} Attempt ${attempt}`,
                new NetworkError(error.message)
              );
            } else {
              logError(
                `Worker ${workerId} - Image ${index + 1} Attempt ${attempt}`,
                error
              );
            }
          }

          // Retry with exponential backoff
          if (attempt <= MAX_RETRIES && !signal.aborted) {
            const waitTime = 1000 * Math.pow(2, attempt - 1);
            await delay(waitTime);
          }
        }
      }

      // If failed and not aborted, report error image
      if (!success && !signal.aborted) {
        callbacks.onImage({
          id: generateUUID(),
          data: '',
          mimeType: '',
          status: 'error'
        });
      }

      // Update progress
      if (!signal.aborted) {
        completedCount++;
        callbacks.onProgress(completedCount, settings.batchSize);
      }
    }
  };

  // Start workers
  const numWorkers = Math.min(MAX_CONCURRENT_REQUESTS, settings.batchSize);
  const workers = Array.from({ length: numWorkers }, (_, i) => worker(i + 1));

  await Promise.all(workers);
}
