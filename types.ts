export interface GeneratedImage {
  id: string;
  data: string; // Base64 data URI
  mimeType: string;
  status: 'success' | 'error';
  storageSize?: number;
  lastAccessedAt?: number;
}

export type GenerationErrorKind =
  | 'network'
  | 'http'
  | 'moderation'
  | 'invalid_request'
  | 'unknown';

export interface GenerationErrorInfo {
  kind: GenerationErrorKind;
  message: string;
  statusCode?: number;
  code?: string;
  type?: string;
  requestId?: string;
  attempts: number;
  retryable: boolean;
}

interface GenerationSlotBase {
  slotId: string;
  index: number;
  attempts: number;
}

export type GenerationSlot =
  | (GenerationSlotBase & { status: 'pending' })
  | (GenerationSlotBase & { status: 'success'; image: GeneratedImage })
  | (GenerationSlotBase & { status: 'failed'; error: GenerationErrorInfo })
  | (GenerationSlotBase & { status: 'cancelled'; reason: string });

export interface GenerationSlotDescriptor {
  slotId: string;
  index: number;
}

export type GenerationSlotResult =
  | {
      slotId: string;
      index: number;
      status: 'success';
      attempts: number;
      image: GeneratedImage;
    }
  | {
      slotId: string;
      index: number;
      status: 'failed';
      attempts: number;
      error: GenerationErrorInfo;
    }
  | {
      slotId: string;
      index: number;
      status: 'cancelled';
      attempts: number;
      reason: string;
    };

export interface UploadedImage {
  id: string;
  data: string; // Base64 data URI
  mimeType: string;
  name?: string; // Original filename
  storageSize?: number;
  lastAccessedAt?: number;
}

export const ASPECT_RATIO_OPTIONS = [
  { value: 'Auto', label: 'Auto Ratio' },
  { value: '1:1', label: '1:1 Square' },
  { value: '1:4', label: '1:4 Ultra Tall' },
  { value: '1:8', label: '1:8 Ultra Tall' },
  { value: '2:3', label: '2:3 Portrait' },
  { value: '3:2', label: '3:2 Landscape' },
  { value: '3:4', label: '3:4 Portrait' },
  { value: '4:1', label: '4:1 Panorama' },
  { value: '4:3', label: '4:3 Landscape' },
  { value: '4:5', label: '4:5 Portrait' },
  { value: '5:4', label: '5:4 Landscape' },
  { value: '8:1', label: '8:1 Panorama' },
  { value: '9:16', label: '9:16 Tall' },
  { value: '16:9', label: '16:9 Wide' },
  { value: '21:9', label: '21:9 Cinematic' }
] as const;

export type AspectRatio = (typeof ASPECT_RATIO_OPTIONS)[number]['value'];

export const GPT_IMAGE_ASPECT_RATIO_OPTIONS = [
  { value: 'Auto', label: 'Auto Ratio' },
  { value: '1:1', label: '1:1 Square' },
  { value: '2:3', label: '2:3 Portrait' },
  { value: '3:2', label: '3:2 Landscape' },
  { value: '3:4', label: '3:4 Portrait' },
  { value: '4:3', label: '4:3 Landscape' },
  { value: '4:5', label: '4:5 Portrait' },
  { value: '5:4', label: '5:4 Landscape' },
  { value: '9:16', label: '9:16 Tall' },
  { value: '16:9', label: '16:9 Wide' },
  { value: '21:9', label: '21:9 Cinematic' }
] as const satisfies ReadonlyArray<{ value: AspectRatio; label: string }>;

export type Resolution = '1K' | '2K' | '4K';
export type Provider = 'gemini' | 'openai';

export interface ProviderConfig {
  provider: Provider;
  apiKey: string;
  baseUrl?: string; // For OpenAI custom endpoint or Gemini proxy
  model?: string; // Model name
}

export interface AppSettings {
  batchSize: number; // 1 to 20
  aspectRatio: AspectRatio;
  resolution: Resolution;
  providerConfig: ProviderConfig;
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  text?: string; // The primary text to display
  textVariations?: string[]; // All unique text responses received
  generationSlots?: GenerationSlot[]; // Single source of truth for new generations
  images?: GeneratedImage[]; // Legacy import compatibility only
  uploadedImages?: UploadedImage[]; // User uploaded images (user only)
  // Store settings used for this generation to display correctly
  generationSettings?: {
    aspectRatio: AspectRatio;
    resolution?: Resolution;
  };
  // The index of the image the user selected to keep for context.
  // If undefined, no image from this batch is used in future context.
  selectedImageId?: string;
  timestamp: number;
  isError?: boolean;
}

export interface Session {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  messageCount?: number;
}
