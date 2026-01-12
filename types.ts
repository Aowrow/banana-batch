export interface GeneratedImage {
  id: string;
  data: string; // Base64 data URI
  mimeType: string;
  status: 'success' | 'error';
}

export interface UploadedImage {
  id: string;
  data: string; // Base64 data URI
  mimeType: string;
  name?: string; // Original filename
}

export type AspectRatio = 'Auto' | '1:1' | '3:4' | '4:3' | '9:16' | '16:9';
export type Resolution = '1K' | '2K' | '4K';

export interface AppSettings {
  batchSize: number; // 1 to 20
  aspectRatio: AspectRatio;
  resolution: Resolution;
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  text?: string; // The primary text to display
  textVariations?: string[]; // All unique text responses received
  images?: GeneratedImage[]; // Generated images (model only)
  uploadedImages?: UploadedImage[]; // User uploaded images (user only)
  // Store settings used for this generation to display correctly
  generationSettings?: {
    aspectRatio: AspectRatio;
  };
  // The index of the image the user selected to keep for context. 
  // If undefined, no image from this batch is used in future context.
  selectedImageId?: string; 
  timestamp: number;
  isError?: boolean;
}