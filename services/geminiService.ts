import { GoogleGenAI, Content, Part } from "@google/genai";
import { Message, GeneratedImage, AppSettings } from "../types";

const MODEL_FLASH = 'gemini-2.5-flash-image';
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
  callbacks: StreamCallbacks,
  signal: AbortSignal
): Promise<void> => {
  
  if (!apiKey) {
      throw new Error("API Key is missing. Please configure it in settings.");
  }

  // Initialize the client per request with the provided key
  const ai = new GoogleGenAI({ apiKey });
  
  const formattedHistory = buildHistory(history);
  
  // Determine model and config based on settings
  const usePro = settings.resolution === '2K' || settings.resolution === '4K';
  const modelName = usePro ? MODEL_PRO : MODEL_FLASH;

  const imageConfig: any = {};
  
  if (settings.aspectRatio && settings.aspectRatio !== 'Auto') {
    imageConfig.aspectRatio = settings.aspectRatio;
  }

  if (usePro) {
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
          const response = await ai.models.generateContent({
            model: modelName,
            contents: [
              ...formattedHistory,
              { role: 'user', parts: [{ text: prompt }] }
            ],
            config: config
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
                id: crypto.randomUUID(),
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
             console.warn(`[Worker ${workerId}] Image ${index + 1} attempt ${attempt} failed: ${error.message || error}`);
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
            id: crypto.randomUUID(),
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
  
  await Promise.all(workers);
};