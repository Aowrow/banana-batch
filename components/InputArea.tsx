import React, { useState, useRef, KeyboardEvent, DragEvent } from 'react';
import { SendHorizontal, Square, X } from 'lucide-react';
import { UploadedImage } from '../types';
import { generateUUID } from '../utils/uuid';

interface InputAreaProps {
  onSend: (text: string, images?: UploadedImage[]) => void;
  onStop: () => void;
  disabled: boolean; // This now means "isGenerating" essentially
  theme: 'light' | 'dark';
}

const InputArea: React.FC<InputAreaProps> = ({ onSend, onStop, disabled, theme }) => {
  const isLight = theme === 'light';
  const [text, setText] = useState('');
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  const processFiles = async (files: FileList) => {
    const MAX_IMAGES = 10; // Limit number of images per request
    const MAX_FILE_SIZE_MB = 20; // Maximum file size in MB
    
    const fileArray = Array.from(files);
    
    // Check total image count
    if (uploadedImages.length + fileArray.length > MAX_IMAGES) {
      alert(`最多只能上传 ${MAX_IMAGES} 张图片。当前已有 ${uploadedImages.length} 张，本次只能上传 ${MAX_IMAGES - uploadedImages.length} 张。`);
      return;
    }
    
    // Filter valid image files first
    const validFiles: File[] = [];
    for (const file of fileArray) {
      // Check file type
      if (!file.type.startsWith('image/')) {
        continue; // Silently ignore non-image files
      }
      
      // Check file size
      const fileSizeMB = file.size / (1024 * 1024);
      if (fileSizeMB > MAX_FILE_SIZE_MB) {
        alert(`图片 "${file.name}" 太大（${fileSizeMB.toFixed(2)}MB），最大支持 ${MAX_FILE_SIZE_MB}MB`);
        continue;
      }
      
      // Check for duplicate images (by name and size)
      const isDuplicate = uploadedImages.some(
        img => img.name === file.name && img.data.length === file.size
      );
      if (isDuplicate) {
        console.warn(`Skipping duplicate image: ${file.name}`);
        continue;
      }
      
      validFiles.push(file);
    }
    
    // Process files in order using Promise.all to maintain order
    const imagePromises = validFiles.map((file: File, index: number) => {
      return new Promise<UploadedImage | null>((resolve) => {
        const reader = new FileReader();
        reader.onload = (event: ProgressEvent<FileReader>) => {
          const dataUrl = event.target?.result as string;
          if (dataUrl) {
            const uploadedImage: UploadedImage = {
              id: generateUUID(),
              data: dataUrl,
              mimeType: file.type,
              name: file.name
            };
            resolve(uploadedImage);
          } else {
            resolve(null);
          }
        };
        reader.onerror = () => {
          alert(`读取图片 "${file.name}" 失败，请重试`);
          resolve(null);
        };
        reader.readAsDataURL(file);
      });
    });
    
    // Wait for all images to load, maintaining order
    const loadedImages = await Promise.all(imagePromises);
    const validImages = loadedImages.filter((img): img is UploadedImage => img !== null);
    
    // Add images in order
    if (validImages.length > 0) {
      setUploadedImages(prev => [...prev, ...validImages]);
    }
  };

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (!disabled && dragCounterRef.current === 1) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    // Only set dragging to false when we've truly left the container
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);

    if (disabled) return;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processFiles(files);
    }
  };

  const removeImage = (id: string) => {
    setUploadedImages(prev => prev.filter(img => img.id !== id));
  };

  const handleSend = () => {
    console.log('handleSend called', { text: text.trim(), imagesCount: uploadedImages.length, disabled });
    if ((text.trim() || uploadedImages.length > 0) && !disabled) {
      console.log('Calling onSend');
      onSend(text.trim(), uploadedImages.length > 0 ? uploadedImages : undefined);
      setText('');
      setUploadedImages([]);
    } else {
      console.log('Send blocked:', { hasText: !!text.trim(), hasImages: uploadedImages.length > 0, disabled });
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div 
      className={`p-4 backdrop-blur-xl border-t transition-colors duration-200 ${
        isLight
          ? 'bg-white/80 border-gray-200'
          : 'bg-zinc-950/80 border-zinc-800'
      } ${isDragging ? 'ring-2 ring-indigo-500 ring-offset-2' : ''}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="max-w-4xl mx-auto relative">
        {/* Drag Overlay */}
        {isDragging && (
          <div className={`absolute inset-0 flex items-center justify-center rounded-lg z-20 ${
            isLight
              ? 'bg-indigo-50/90 border-2 border-dashed border-indigo-400'
              : 'bg-indigo-900/30 border-2 border-dashed border-indigo-500'
          }`}>
            <div className={`text-center ${isLight ? 'text-indigo-700' : 'text-indigo-300'}`}>
              <p className="text-lg font-semibold">拖放图片到这里</p>
              <p className="text-sm mt-1">图片将添加到消息中</p>
            </div>
          </div>
        )}

        {/* Image Preview */}
        {uploadedImages.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {uploadedImages.map((img) => (
              <div key={img.id} className="relative group">
                <img 
                  src={img.data} 
                  alt={img.name || 'Uploaded image'}
                  className={`w-20 h-20 object-cover rounded-lg border-2 transition-colors ${
                    isLight
                      ? 'border-indigo-400'
                      : 'border-indigo-500/50'
                  }`}
                />
                <button
                  onClick={() => removeImage(img.id)}
                  className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Remove image"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="relative">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder={disabled ? "Generating images... Press stop to cancel." : "描述你想要生成的图片，或拖放图片到这里..."}
            className={`w-full border-0 rounded-2xl py-4 pl-4 pr-14 focus:ring-2 focus:ring-indigo-500/50 resize-none min-h-[60px] max-h-[120px] shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 ${
              isLight
                ? 'bg-gray-100 text-gray-900 placeholder-gray-400'
                : 'bg-zinc-900 text-zinc-100 placeholder-zinc-600'
            }`}
            rows={1}
            style={{ height: '60px' }} 
          />
          
          {disabled ? (
            <button
              onClick={onStop}
              className="absolute right-2 top-2 bottom-2 aspect-square rounded-xl flex items-center justify-center transition-all bg-red-500/20 text-red-500 hover:bg-red-500 hover:text-white border border-red-500/50"
              title="Stop Generating"
            >
              <Square size={18} fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!text.trim() && uploadedImages.length === 0}
              className={`
                absolute right-2 top-2 bottom-2 aspect-square rounded-xl flex items-center justify-center transition-all
                ${(!text.trim() && uploadedImages.length === 0)
                  ? (isLight 
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                      : 'bg-zinc-800 text-zinc-600 cursor-not-allowed')
                  : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-600/20'}
              `}
            >
              <SendHorizontal size={20} />
            </button>
          )}
        </div>
      </div>
      <div className={`max-w-4xl mx-auto mt-2 text-center text-xs transition-colors duration-200 ${
        isLight ? 'text-gray-500' : 'text-zinc-600'
      }`}>
        Uses <strong>Flash Image</strong> for 1K (Fast) and <strong>Pro Image</strong> for 2K/4K. Only selected images are remembered.
      </div>
    </div>
  );
};

export default InputArea;