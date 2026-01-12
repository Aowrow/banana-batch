import { GoogleGenAI, Content, Part } from "@google/genai";
import { Message, GeneratedImage, AppSettings, UploadedImage } from "../types";
import { generateUUID } from "../utils/uuid";

const MODEL_PRO = 'gemini-3-pro-image-preview';
const MAX_CONCURRENT_REQUESTS = 10;
const MAX_RETRIES = 3; 

/**
 * Constructs the conversation history formatted for the Gemini API.
 */
const buildHistory = (messages: Message[]): Content[] => {
  const history: Content[] = [];

  for (const msg of messages) {
    const parts: Part[] = [];

    if (msg.role === 'user') {
      // Add uploaded images first
      if (msg.uploadedImages && msg.uploadedImages.length > 0) {
        for (const img of msg.uploadedImages) {
          // Extract base64 data safely
          const base64Match = img.data.match(/^data:([^;]+);base64,(.+)$/);
          if (!base64Match) {
            console.warn(`Invalid image data format in history for image ${img.id}, skipping`);
            continue;
          }
          
          const [, mimeTypeFromData, base64Data] = base64Match;
          const finalMimeType = mimeTypeFromData || img.mimeType || 'image/png';
          
          if (!base64Data || base64Data.length === 0) {
            console.warn(`Empty base64 data in history for image ${img.id}, skipping`);
            continue;
          }
          
          parts.push({
            inlineData: {
              mimeType: finalMimeType,
              data: base64Data
            }
          });
        }
      }
      // Add text
      if (msg.text) {
        parts.push({ text: msg.text });
      }
    } else if (msg.role === 'model') {
      // Logic: If the model generated images, check if one was selected.
      if (msg.images && msg.images.length > 0) {
        const selectedImg = msg.images.find(img => img.id === msg.selectedImageId);
        
        // Only include SUCCESSFUL images in history
        if (selectedImg && selectedImg.status === 'success') {
          const base64Data = selectedImg.data.split(',')[1]; 
          parts.push({
            inlineData: {
              mimeType: selectedImg.mimeType,
              data: base64Data
            }
          });
        }
      }
      
      // Use the primary text for history
      if (msg.text) {
        parts.push({ text: msg.text });
      }
    }

    if (parts.length > 0) {
      history.push({
        role: msg.role,
        parts: parts
      });
    }
  }

  return history;
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface StreamCallbacks {
    onImage: (image: GeneratedImage) => void;
    onText: (text: string) => void;
    onProgress: (completed: number, total: number) => void;
}

/**
 * Generates images concurrently with streaming updates and abort support.
 * Accepts apiKey dynamically.
 */
export const generateImageBatchStream = async (
  apiKey: string,
  prompt: string,
  history: Message[],
  settings: AppSettings,
  uploadedImages: UploadedImage[] | undefined,
  callbacks: StreamCallbacks,
  signal: AbortSignal
): Promise<void> => {
  
  console.log('generateImageBatchStream called', {
    hasApiKey: !!apiKey,
    apiKeyLength: apiKey?.length || 0,
    promptLength: prompt?.length || 0,
    historyLength: history.length,
    imagesCount: uploadedImages?.length || 0,
    batchSize: settings.batchSize
  });
  
  if (!apiKey) {
      console.error("API Key is missing");
      throw new Error("API Key is missing. Please configure it in settings.");
  }

  // Initialize the client per request with the provided key
  const ai = new GoogleGenAI({ apiKey });
  console.log('GoogleGenAI client initialized');
  
  const formattedHistory = buildHistory(history);
  
  // Build user message parts according to Gemini API best practices
  // Reference: https://ai.google.dev/gemini-api/docs/image-generation
  // Order: text first, then images (for better context understanding)
  const userParts: Part[] = [];
  
  // Process and validate images first
  const validImages: Part[] = [];
  if (uploadedImages && uploadedImages.length > 0) {
    for (let i = 0; i < uploadedImages.length; i++) {
      const img = uploadedImages[i];
      
      // Extract base64 data safely
      const base64Match = img.data.match(/^data:([^;]+);base64,(.+)$/);
      if (!base64Match) {
        console.warn(`Invalid image data format for image ${img.id} (image ${i + 1}), skipping`);
        continue;
      }
      
      const [, mimeTypeFromData, base64Data] = base64Match;
      
      // Use mimeType from data URL if available, otherwise use stored mimeType
      const finalMimeType = mimeTypeFromData || img.mimeType || 'image/png';
      
      // Validate base64 data exists
      if (!base64Data || base64Data.length === 0) {
        console.warn(`Empty base64 data for image ${img.id} (image ${i + 1}), skipping`);
        continue;
      }
      
      // Estimate image size (base64 is ~33% larger than binary)
      const estimatedSizeMB = (base64Data.length * 3 / 4) / (1024 * 1024);
      
      // Gemini API typically has a limit of ~20MB per image
      if (estimatedSizeMB > 20) {
        console.warn(`Image ${img.id} (image ${i + 1}) is too large (${estimatedSizeMB.toFixed(2)}MB), skipping`);
        continue;
      }
      
      validImages.push({
        inlineData: {
          mimeType: finalMimeType,
          data: base64Data
        }
      });
    }
    
    // Warn if no valid images were processed
    if (validImages.length === 0 && uploadedImages.length > 0) {
      throw new Error("No valid images could be processed. Please check image format and size.");
    }
  }
  
  // According to Gemini API docs: text first, then images
  // This order helps the model better understand the context
  if (prompt) {
    let enhancedPrompt = prompt;
    
    // If there are multiple images, enhance the prompt to clarify image references
    if (validImages.length > 1) {
      // Check if prompt mentions image numbers (图一, 图二, etc. or image 1, image 2, etc.)
      const hasImageReference = /图[一二三四五六七八九十\d]|image\s*[1-9\d]|第[一二三四五六七八九十\d]张|第[1-9\d]张/i.test(prompt);
      
      if (hasImageReference) {
        // Add clarification about image order
        const imageCount = validImages.length;
        const imageLabels = Array.from({ length: imageCount }, (_, i) => {
          const num = i + 1;
          const chineseNum = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'][num - 1] || num.toString();
          return `图${chineseNum}（第${num}张上传的图片）`;
        }).join('、');
        
        enhancedPrompt = `参考图片说明：${imageLabels}。\n\n${prompt}`;
      }
    }
    
    // Add text first (following API example pattern)
    userParts.push({ text: enhancedPrompt });
  }
  
  // Then add all images in order
  userParts.push(...validImages);
  
  // Ensure at least one part exists
  if (userParts.length === 0) {
    throw new Error("At least one image or text prompt is required.");
  }
  
  // Always use Pro model (gemini-3-pro-image-preview) for better quality
  const modelName = MODEL_PRO;

  const imageConfig: any = {};
  
  // Set aspect ratio if specified
  if (settings.aspectRatio && settings.aspectRatio !== 'Auto') {
    imageConfig.aspectRatio = settings.aspectRatio;
  }

  // Set image size based on resolution setting
  // Pro model supports 1K, 2K, and 4K resolutions
  if (settings.resolution === '1K' || settings.resolution === '2K' || settings.resolution === '4K') {
    imageConfig.imageSize = settings.resolution;
  }

  const config = Object.keys(imageConfig).length > 0 ? { imageConfig } : undefined;

  // Shared task queue
  const taskQueue = Array.from({ length: settings.batchSize }, (_, i) => i);
  let completedCount = 0;

  // Worker function
  const worker = async (workerId: number) => {
    while (taskQueue.length > 0) {
      // Check for cancellation
      if (signal.aborted) return;

      const index = taskQueue.shift();
      if (index === undefined) break;

      let attempt = 0;
      let success = false;
      
      while (attempt <= MAX_RETRIES && !success) {
        if (signal.aborted) return; // Check abort inside retry loop

        try {
          // Build contents array: history + current user message
          // Format matches Gemini API documentation example
          const contents = [
            ...formattedHistory,
            { role: 'user' as const, parts: userParts }
          ];
          
          console.log(`[Worker ${workerId}] Requesting image ${index + 1}`, {
            model: modelName,
            historyLength: formattedHistory.length,
            userPartsCount: userParts.length,
            config
          });
          
          const response = await ai.models.generateContent({
            model: modelName,
            contents: contents,
            config: config
          });
          
          console.log(`[Worker ${workerId}] Received response for image ${index + 1}`, {
            hasCandidates: !!response.candidates,
            candidatesCount: response.candidates?.length || 0
          });

          const candidate = response.candidates?.[0];
          if (!candidate) throw new Error("No candidate returned");

          if (candidate.finishReason === 'SAFETY') {
             console.warn(`[Worker ${workerId}] Image ${index + 1} blocked by safety filters.`);
             break; 
          }

          const content = candidate.content;
          if (!content?.parts) throw new Error("No content parts");

          let foundImage = false;
          for (const part of content.parts) {
            if (part.inlineData) {
              const img: GeneratedImage = {
                id: generateUUID(),
                data: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
                mimeType: part.inlineData.mimeType,
                status: 'success'
              };
              callbacks.onImage(img);
              foundImage = true;
            } else if (part.text) {
               callbacks.onText(part.text);
            }
          }

          if (foundImage) {
            success = true;
          } else {
            throw new Error("No image data in response");
          }

        } catch (error: any) {
          attempt++;
          // Only log warnings if not aborted
          if (!signal.aborted) {
             console.error(`[Worker ${workerId}] Image ${index + 1} attempt ${attempt} failed:`, {
               error: error.message || error,
               errorType: error?.constructor?.name,
               errorStack: error?.stack,
               isNetworkError: error?.message?.includes('fetch') || error?.message?.includes('network') || error?.message?.includes('CORS'),
               isApiKeyError: error?.message?.includes('API') || error?.message?.includes('key') || error?.message?.includes('401') || error?.message?.includes('403')
             });
          }
          
          if (attempt <= MAX_RETRIES && !signal.aborted) {
             const waitTime = 1000 * Math.pow(2, attempt - 1);
             await delay(waitTime);
          }
        }
      }

      // If failed and not aborted, report error
      if (!success && !signal.aborted) {
         callbacks.onImage({
            id: generateUUID(),
            data: '',
            mimeType: '',
            status: 'error'
         });
      }

      if (!signal.aborted) {
        completedCount++;
        callbacks.onProgress(completedCount, settings.batchSize);
      }
    }
  };

  const numWorkers = Math.min(MAX_CONCURRENT_REQUESTS, settings.batchSize);
  const workers = Array.from({ length: numWorkers }, (_, i) => worker(i + 1));
  
  console.log(`Starting ${numWorkers} workers for ${settings.batchSize} images`);
  
  try {
    await Promise.all(workers);
    console.log('All workers completed');
  } catch (error: any) {
    console.error('Worker pool error:', error);
    throw error;
  }
};