import {
  AppSettings,
  Message,
  UploadedImage,
  ProviderConfig,
  GenerationSlotDescriptor,
  GenerationSlotResult
} from '../types';
import { generateImageBatchStream } from '../services/geminiService';
import { generateImageBatchStreamOpenAI } from '../services/openaiService';
import { APIKeyError } from '../types/errors';
import { resolveSettings } from './config';

export interface GenerationCallbacks {
  onSlotResult: (result: GenerationSlotResult) => void;
  onText: (text: string) => void;
}

export interface GenerationRequest {
  prompt: string;
  history?: Message[];
  uploadedImages?: UploadedImage[];
  settings?: Partial<AppSettings>;
  providerConfig?: Partial<ProviderConfig>;
  slots: GenerationSlotDescriptor[];
  signal: AbortSignal;
  callbacks: GenerationCallbacks;
}

export async function runImageGeneration(request: GenerationRequest): Promise<void> {
  const settings = resolveSettings(request.settings, request.providerConfig);
  const providerConfig = settings.providerConfig;

  if (!providerConfig.apiKey) {
    const providerName = providerConfig.provider === 'openai' ? 'OpenAI' : 'Gemini';
    throw new APIKeyError('API Key is missing', providerName);
  }

  const history = request.history ?? [];

  if (providerConfig.provider === 'openai') {
    await generateImageBatchStreamOpenAI(
      providerConfig.apiKey,
      providerConfig.baseUrl || 'https://api.openai.com/v1',
      providerConfig.model || 'gpt-image-2',
      request.prompt,
      history,
      settings,
      request.uploadedImages,
      request.slots,
      {
        onSlotResult: request.callbacks.onSlotResult,
        onText: request.callbacks.onText
      },
      request.signal
    );
    return;
  }

  await generateImageBatchStream(
    providerConfig.apiKey,
    request.prompt,
    history,
    settings,
    request.uploadedImages,
    request.slots,
    {
      onSlotResult: request.callbacks.onSlotResult,
      onText: request.callbacks.onText
    },
    request.signal
  );
}
