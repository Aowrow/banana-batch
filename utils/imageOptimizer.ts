/**
 * Image optimization utilities to prevent performance issues with large images
 */

// Maximum dimensions for uploaded images
const MAX_WIDTH = 2048;
const MAX_HEIGHT = 2048;

// Maximum file size after optimization (in MB)
const MAX_OPTIMIZED_SIZE_MB = 5;

// JPEG quality for compression (0-1)
const JPEG_QUALITY = 0.85;

export interface OptimizationResult {
  data: string; // Base64 data URI
  mimeType: string;
  originalSize: number; // in bytes
  optimizedSize: number; // in bytes
  wasOptimized: boolean;
  originalDimensions?: { width: number; height: number };
  finalDimensions?: { width: number; height: number };
}

/**
 * Load image from file and get its dimensions
 */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

/**
 * Calculate new dimensions while maintaining aspect ratio
 */
function calculateNewDimensions(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  let newWidth = width;
  let newHeight = height;

  // Check if resizing is needed
  if (width > maxWidth || height > maxHeight) {
    const widthRatio = maxWidth / width;
    const heightRatio = maxHeight / height;
    const ratio = Math.min(widthRatio, heightRatio);

    newWidth = Math.round(width * ratio);
    newHeight = Math.round(height * ratio);
  }

  return { width: newWidth, height: newHeight };
}

/**
 * Compress and resize image if needed
 */
function compressImage(
  img: HTMLImageElement,
  mimeType: string,
  quality: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Failed to get canvas context'));
      return;
    }

    // Calculate new dimensions
    const { width, height } = calculateNewDimensions(
      img.width,
      img.height,
      MAX_WIDTH,
      MAX_HEIGHT
    );

    // Set canvas size
    canvas.width = width;
    canvas.height = height;

    // Draw image on canvas (this performs the resize)
    ctx.drawImage(img, 0, 0, width, height);

    // Convert to base64
    // Use JPEG for better compression, unless it's PNG with transparency
    let outputMimeType = mimeType;
    let outputQuality = quality;

    // For GIF/WebP, convert to JPEG for better compression
    if (mimeType === 'image/gif' || mimeType === 'image/webp') {
      outputMimeType = 'image/jpeg';
    }

    try {
      const dataUrl = canvas.toDataURL(outputMimeType, outputQuality);
      resolve(dataUrl);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Get size of base64 data URI in bytes
 */
function getBase64Size(dataUrl: string): number {
  // Remove data URI prefix (e.g., "data:image/jpeg;base64,")
  const base64String = dataUrl.split(',')[1];
  // Base64 encoding adds ~33% overhead, but we calculate actual size
  return Math.ceil((base64String.length * 3) / 4);
}

/**
 * Optimize an image file for upload
 * - Resizes if dimensions exceed MAX_WIDTH or MAX_HEIGHT
 * - Compresses to reduce file size
 * - Returns optimized base64 data URI
 */
export async function optimizeImage(file: File): Promise<OptimizationResult> {
  const originalSize = file.size;
  const mimeType = file.type;

  // Load image to get dimensions
  const img = await loadImage(file);

  const originalDimensions = {
    width: img.width,
    height: img.height
  };

  // Check if optimization is needed
  const needsResize = img.width > MAX_WIDTH || img.height > MAX_HEIGHT;
  const needsCompression = originalSize > MAX_OPTIMIZED_SIZE_MB * 1024 * 1024;

  if (!needsResize && !needsCompression) {
    // No optimization needed, return original
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = e.target?.result as string;
        resolve({
          data,
          mimeType,
          originalSize,
          optimizedSize: originalSize,
          wasOptimized: false,
          originalDimensions,
          finalDimensions: originalDimensions
        });
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  // Compress and/or resize the image
  let quality = JPEG_QUALITY;
  let dataUrl = await compressImage(img, mimeType, quality);
  let optimizedSize = getBase64Size(dataUrl);

  // If still too large, reduce quality iteratively
  let attempts = 0;
  const maxAttempts = 5;
  while (
    optimizedSize > MAX_OPTIMIZED_SIZE_MB * 1024 * 1024 &&
    quality > 0.5 &&
    attempts < maxAttempts
  ) {
    quality -= 0.1;
    dataUrl = await compressImage(img, mimeType, quality);
    optimizedSize = getBase64Size(dataUrl);
    attempts++;
  }

  const finalDimensions = calculateNewDimensions(
    img.width,
    img.height,
    MAX_WIDTH,
    MAX_HEIGHT
  );

  return {
    data: dataUrl,
    mimeType: dataUrl.startsWith('data:image/jpeg') ? 'image/jpeg' : mimeType,
    originalSize,
    optimizedSize,
    wasOptimized: true,
    originalDimensions,
    finalDimensions
  };
}

/**
 * Estimate if an image file needs optimization without loading it
 */
export function shouldOptimizeImage(file: File): boolean {
  const sizeMB = file.size / (1024 * 1024);
  return sizeMB > 1; // Optimize images larger than 1MB
}
