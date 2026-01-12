import React, { useEffect, useRef, useState } from 'react';
import { Message, AspectRatio } from '../types';
import { User, Sparkles, CheckCircle2, Circle, AlertTriangle, Loader2, ChevronDown, ChevronUp, MessageSquare, RotateCcw, Trash2 } from 'lucide-react';

interface MessageListProps {
  messages: Message[];
  isGenerating: boolean;
  progress: { current: number, total: number } | null;
  onSelectImage: (messageId: string, imageId: string) => void;
  onRetry?: (messageId: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  theme: 'light' | 'dark';
  currentGeneratingMessageId?: string;
}

const MessageList: React.FC<MessageListProps> = ({ messages, isGenerating, progress, onSelectImage, onRetry, onDeleteMessage, theme, currentGeneratingMessageId }) => {
  const isLight = theme === 'light';
  const bottomRef = useRef<HTMLDivElement>(null);
  
  // State to track which message's text details are expanded
  const [expandedTextId, setExpandedTextId] = useState<string | null>(null);

  useEffect(() => {
    // Only scroll if we are generating and near bottom, or new message added
    if (isGenerating || messages.length > 0) {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, isGenerating, progress?.current]);

  const toggleTextExpansion = (id: string) => {
    setExpandedTextId(prev => prev === id ? null : id);
  };

  // Determine grid columns based on image count to ensure a standardized layout
  const getGridClass = (count: number) => {
    if (count === 0) return 'hidden';
    if (count === 1) return 'grid-cols-1 max-w-sm'; // Single image
    if (count === 2) return 'grid-cols-2 max-w-2xl'; // Two large images
    if (count <= 4) return 'grid-cols-2 max-w-2xl'; // 2x2 grid
    if (count <= 6) return 'grid-cols-2 sm:grid-cols-3'; // 2x3 or 3x2
    if (count <= 9) return 'grid-cols-2 sm:grid-cols-3'; // Up to 3x3
    // For 10-20 images (Dense Grid)
    return 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5'; 
  };

  // Convert settings aspect ratio to CSS style
  const getAspectRatioStyle = (ratio?: AspectRatio) => {
    switch (ratio) {
      case '1:1': return { aspectRatio: '1 / 1' };
      case '3:4': return { aspectRatio: '3 / 4' };
      case '4:3': return { aspectRatio: '4 / 3' };
      case '9:16': return { aspectRatio: '9 / 16' };
      case '16:9': return { aspectRatio: '16 / 9' };
      case 'Auto': default: return { aspectRatio: '1 / 1' }; 
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-8 pb-32">

      {messages.length === 0 && (
        <div className={`flex flex-col items-center justify-center h-full space-y-4 opacity-50 ${
          isLight ? 'text-gray-400' : 'text-zinc-500'
        }`}>
          <Sparkles size={48} className="text-indigo-500 animate-pulse" />
          <p className={`text-center text-sm ${
            isLight ? 'text-gray-500' : 'text-zinc-400'
          }`}>Start by typing a prompt to generate images...</p>
        </div>
      )}

      {messages.map((msg, index) => (
        <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} group`}>
          <div className={`max-w-[90%] w-full flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
            
            {/* Delete button - show on hover */}
            {onDeleteMessage && (
              <button
                onClick={() => onDeleteMessage(msg.id)}
                className={`self-start mt-1 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity ${
                  isLight
                    ? 'hover:bg-red-100 text-red-600'
                    : 'hover:bg-red-900/30 text-red-400'
                }`}
                title="删除此消息及之后的所有消息"
              >
                <Trash2 size={14} />
              </button>
            )}
            
            {/* Avatar */}
            <div className={`
              w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-1
              ${msg.role === 'user' 
                ? (isLight ? 'bg-gray-300' : 'bg-zinc-700')
                : 'bg-indigo-600'
              }
            `}>
              {msg.role === 'user' ? <User size={16} /> : <Sparkles size={16} />}
            </div>

            {/* Content */}
            <div className={`flex flex-col space-y-3 ${msg.role === 'user' ? 'items-end' : 'items-start'} w-full`}>
              
              {/* User Uploaded Images */}
              {msg.role === 'user' && msg.uploadedImages && msg.uploadedImages.length > 0 && (
                <div className="flex flex-wrap gap-2 max-w-md">
                  {msg.uploadedImages.map((img, index) => {
                    const imageNumber = index + 1;
                    const chineseNumber = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'][imageNumber - 1] || imageNumber.toString();
                    return (
                      <div key={img.id} className="relative group">
                        <img
                          src={img.data}
                          alt={img.name || `图${chineseNumber}`}
                          className={`max-w-[200px] max-h-[200px] object-cover rounded-lg border-2 transition-all ${
                            isLight
                              ? 'border-indigo-400 shadow-md'
                              : 'border-indigo-500/50'
                          }`}
                        />
                        {/* Image number badge */}
                        <div className={`absolute top-1 left-1 px-2 py-0.5 text-xs font-bold rounded ${
                          isLight
                            ? 'bg-indigo-600 text-white'
                            : 'bg-indigo-500 text-white'
                        }`}>
                          图{chineseNumber}
                        </div>
                        {img.name && (
                          <div className={`absolute bottom-0 left-0 right-0 px-2 py-1 text-xs rounded-b-lg truncate ${
                            isLight
                              ? 'bg-black/60 text-white'
                              : 'bg-black/70 text-white'
                          }`}>
                            {img.name}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              
              {/* Text Bubble */}
              {msg.text && (
                <div className={`
                  flex flex-col
                  ${msg.role === 'user' ? 'items-end' : 'items-start'}
                `}>
                  <div className={`
                    px-4 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap max-w-3xl
                    ${msg.role === 'user' 
                      ? (isLight 
                          ? 'bg-indigo-100 text-gray-900 rounded-tr-sm' 
                          : 'bg-zinc-800 text-zinc-100 rounded-tr-sm')
                      : (isLight
                          ? 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm'
                          : 'bg-zinc-900/50 border border-zinc-800 text-zinc-300 rounded-tl-sm')
                    }
                  `}>
                    {msg.text}
                  </div>

                  {/* Text Variations Collapsible */}
                  {msg.role === 'model' && msg.textVariations && msg.textVariations.length > 1 && (
                    <div className="mt-1">
                      <button 
                        onClick={() => toggleTextExpansion(msg.id)}
                        className={`flex items-center space-x-1 text-xs transition-colors ${
                          isLight
                            ? 'text-gray-500 hover:text-gray-700'
                            : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                         <MessageSquare size={12} />
                         <span>
                           {expandedTextId === msg.id ? "Hide" : "Show"} {msg.textVariations.length - 1} other responses
                         </span>
                         {expandedTextId === msg.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>

                      {expandedTextId === msg.id && (
                        <div className={`mt-2 pl-2 border-l-2 space-y-2 animate-in slide-in-from-top-2 fade-in duration-200 ${
                          isLight ? 'border-gray-300' : 'border-zinc-800'
                        }`}>
                          {msg.textVariations.slice(1).map((variant, idx) => (
                            <div key={idx} className={`text-xs p-2 rounded ${
                              isLight
                                ? 'text-gray-600 bg-gray-100'
                                : 'text-zinc-400 bg-zinc-900/30'
                            }`}>
                              {variant}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Image Grid (Model only) */}
              {msg.role === 'model' && msg.images && (
                <div className="w-full">
                  <div className={`grid gap-3 ${getGridClass(msg.images.length)}`}>
                    {msg.images.map((img) => {
                      const isSelected = msg.selectedImageId === img.id;
                      const hasSelection = !!msg.selectedImageId;
                      const isDiscarded = hasSelection && !isSelected;

                      // Error Tile
                      if (img.status === 'error') {
                          return (
                            <div 
                                key={img.id}
                                style={getAspectRatioStyle(msg.generationSettings?.aspectRatio)}
                                className={`w-full rounded-xl border border-dashed flex flex-col items-center justify-center p-4 ${
                                  isLight
                                    ? 'bg-gray-100 border-gray-300 text-gray-500'
                                    : 'bg-zinc-900 border-zinc-800 text-zinc-600'
                                }`}
                            >
                                <AlertTriangle size={24} className="mb-2 opacity-50 text-amber-500" />
                                <span className="text-xs text-center font-medium">Failed</span>
                            </div>
                          );
                      }

                      return (
                        <div 
                          key={img.id} 
                          style={getAspectRatioStyle(msg.generationSettings?.aspectRatio)}
                          className={`
                            group relative w-full rounded-xl overflow-hidden border-2 transition-all duration-300
                            ${isLight ? 'bg-gray-100' : 'bg-zinc-900'}
                            ${isSelected 
                              ? 'border-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.3)] scale-[1.02] z-10' 
                              : (isLight ? 'border-transparent hover:border-gray-400' : 'border-transparent hover:border-zinc-600')}
                            ${isDiscarded ? 'opacity-40 grayscale-[0.8] scale-95' : 'opacity-100'}
                          `}
                        >
                          <img 
                            src={img.data} 
                            alt="Generated content" 
                            className="w-full h-full object-cover animate-in fade-in duration-500"
                            loading="lazy"
                          />
                          
                          {/* Selection Overlay */}
                          <button
                            onClick={() => onSelectImage(msg.id, img.id)}
                            className={`
                              absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center
                              ${isSelected ? 'opacity-100 bg-black/20' : ''}
                            `}
                          >
                            <div className={`
                              flex items-center space-x-2 px-3 py-1.5 rounded-full backdrop-blur-md transition-transform
                              ${isSelected 
                                ? 'bg-indigo-600 text-white' 
                                : (isLight 
                                    ? 'bg-white/90 text-gray-700 hover:scale-105' 
                                    : 'bg-zinc-900/80 text-zinc-300 hover:scale-105')
                              }
                            `}>
                              {isSelected ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                              <span className="text-xs font-semibold">
                                {isSelected ? 'Selected' : 'Select'}
                              </span>
                            </div>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  
                  {msg.images.length > 0 && (
                      <div className={`mt-2 flex items-center justify-between text-xs ${
                        isLight ? 'text-gray-500' : 'text-zinc-500'
                      }`}>
                        <div className="flex items-center space-x-2">
                          <div className={`w-1.5 h-1.5 rounded-full ${
                            currentGeneratingMessageId === msg.id && !msg.selectedImageId 
                              ? 'bg-indigo-500 animate-pulse' 
                              : (isLight ? 'bg-gray-400' : 'bg-zinc-700')
                          }`}></div>
                          <span>
                          {msg.selectedImageId 
                              ? "Image selected." 
                              : currentGeneratingMessageId === msg.id
                                  ? `Generated ${msg.images.length} images so far...` 
                                  : `Generated ${msg.images.length} images.`}
                          </span>
                        </div>
                        
                        {/* Retry button - show next to model messages */}
                        {onRetry && currentGeneratingMessageId !== msg.id && (
                          <button
                            onClick={() => onRetry(msg.id)}
                            className={`flex items-center space-x-1 px-2 py-1 rounded transition-colors ${
                              isLight
                                ? 'text-indigo-600 hover:bg-indigo-50'
                                : 'text-indigo-400 hover:bg-indigo-900/20'
                            }`}
                            title="生成更多图片（增量添加）"
                          >
                            <RotateCcw size={12} />
                            <span>生成更多</span>
                          </button>
                        )}
                      </div>
                  )}
                </div>
              )}

              {/* Error State - only show if no images and an error flag is present */}
              {msg.isError && (!msg.images || msg.images.length === 0) && (
                 <div className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${
                   isLight
                     ? 'text-red-600 bg-red-50 border border-red-200'
                     : 'text-red-400 bg-red-900/10 border border-red-900/50'
                 }`}>
                   <div className="flex items-center">
                     <AlertTriangle size={14} className="mr-2" />
                     Generation stopped or failed.
                   </div>
                   {/* Retry button for failed messages */}
                   {onRetry && (
                     <button
                       onClick={() => onRetry(msg.id)}
                       className={`flex items-center space-x-1 px-2 py-1 rounded transition-colors ml-4 ${
                         isLight
                           ? 'text-indigo-600 hover:bg-indigo-50'
                           : 'text-indigo-400 hover:bg-indigo-900/20'
                       }`}
                       title="重试生成"
                     >
                       <RotateCcw size={12} />
                       <span>重试</span>
                     </button>
                   )}
                 </div>
              )}
            </div>
          </div>
        </div>
      ))}
      
      {/* Loading Indicator for Pending/Queue */}
      {isGenerating && progress && (
        <div className="flex justify-start ml-12">
           <div className={`flex items-center space-x-3 border rounded-lg px-4 py-2 ${
             isLight
               ? 'bg-gray-100 border-gray-300'
               : 'bg-zinc-900/50 border-zinc-800'
           }`}>
                 <Loader2 size={14} className="animate-spin text-indigo-500" />
                 <span className={`text-xs font-medium ${
                   isLight ? 'text-gray-600' : 'text-zinc-400'
                 }`}>
                    Processing batch... ({progress.current}/{progress.total})
                 </span>
                 <div className={`w-24 h-1 rounded-full overflow-hidden ${
                   isLight ? 'bg-gray-300' : 'bg-zinc-800'
                 }`}>
                      <div 
                        className="h-full bg-indigo-500 transition-all duration-300 ease-out"
                        style={{ width: `${(progress.current / progress.total) * 100}%` }}
                      ></div>
                 </div>
           </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
};

export default MessageList;