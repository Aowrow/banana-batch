import React, { useEffect, useRef, useState } from 'react';
import { Message, AspectRatio } from '../types';
import { User, Sparkles, CheckCircle2, Circle, AlertTriangle, Loader2, ChevronDown, ChevronUp, MessageSquare } from 'lucide-react';

interface MessageListProps {
  messages: Message[];
  isGenerating: boolean;
  progress: { current: number, total: number } | null;
  onSelectImage: (messageId: string, imageId: string) => void;
}

const MessageList: React.FC<MessageListProps> = ({ messages, isGenerating, progress, onSelectImage }) => {
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
        <div className="flex flex-col items-center justify-center h-full text-zinc-500 space-y-4 opacity-50">
          <Sparkles size={48} className="text-indigo-500 animate-pulse" />
          <p className="text-center text-sm">Start by typing a prompt to generate images...</p>
        </div>
      )}

      {messages.map((msg) => (
        <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
          <div className={`max-w-[90%] w-full flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
            
            {/* Avatar */}
            <div className={`
              w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-1
              ${msg.role === 'user' ? 'bg-zinc-700' : 'bg-indigo-600'}
            `}>
              {msg.role === 'user' ? <User size={16} /> : <Sparkles size={16} />}
            </div>

            {/* Content */}
            <div className={`flex flex-col space-y-3 ${msg.role === 'user' ? 'items-end' : 'items-start'} w-full`}>
              
              {/* Text Bubble */}
              {msg.text && (
                <div className={`
                  flex flex-col
                  ${msg.role === 'user' ? 'items-end' : 'items-start'}
                `}>
                  <div className={`
                    px-4 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap max-w-3xl
                    ${msg.role === 'user' 
                      ? 'bg-zinc-800 text-zinc-100 rounded-tr-sm' 
                      : 'bg-zinc-900/50 border border-zinc-800 text-zinc-300 rounded-tl-sm'}
                  `}>
                    {msg.text}
                  </div>

                  {/* Text Variations Collapsible */}
                  {msg.role === 'model' && msg.textVariations && msg.textVariations.length > 1 && (
                    <div className="mt-1">
                      <button 
                        onClick={() => toggleTextExpansion(msg.id)}
                        className="flex items-center space-x-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                      >
                         <MessageSquare size={12} />
                         <span>
                           {expandedTextId === msg.id ? "Hide" : "Show"} {msg.textVariations.length - 1} other responses
                         </span>
                         {expandedTextId === msg.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>

                      {expandedTextId === msg.id && (
                        <div className="mt-2 pl-2 border-l-2 border-zinc-800 space-y-2 animate-in slide-in-from-top-2 fade-in duration-200">
                          {msg.textVariations.slice(1).map((variant, idx) => (
                            <div key={idx} className="text-xs text-zinc-400 bg-zinc-900/30 p-2 rounded">
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
                                className="w-full rounded-xl bg-zinc-900 border border-zinc-800 border-dashed flex flex-col items-center justify-center text-zinc-600 p-4"
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
                            group relative w-full rounded-xl overflow-hidden border-2 transition-all duration-300 bg-zinc-900
                            ${isSelected 
                              ? 'border-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.3)] scale-[1.02] z-10' 
                              : 'border-transparent hover:border-zinc-600'}
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
                              ${isSelected ? 'bg-indigo-600 text-white' : 'bg-zinc-900/80 text-zinc-300 hover:scale-105'}
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
                      <div className="mt-2 flex items-center text-xs text-zinc-500 space-x-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${isGenerating && !msg.selectedImageId ? 'bg-indigo-500 animate-pulse' : 'bg-zinc-700'}`}></div>
                        <span>
                        {msg.selectedImageId 
                            ? "Image selected." 
                            : isGenerating 
                                ? `Generated ${msg.images.length} images so far...` 
                                : `Generated ${msg.images.length} images.`}
                        </span>
                      </div>
                  )}
                </div>
              )}

              {/* Error State - only show if no images and an error flag is present */}
              {msg.isError && (!msg.images || msg.images.length === 0) && (
                 <div className="flex items-center text-red-400 bg-red-900/10 border border-red-900/50 px-3 py-2 rounded-lg text-sm">
                   <AlertTriangle size={14} className="mr-2" />
                   Generation stopped or failed.
                 </div>
              )}
            </div>
          </div>
        </div>
      ))}
      
      {/* Loading Indicator for Pending/Queue */}
      {isGenerating && progress && (
        <div className="flex justify-start ml-12">
           <div className="flex items-center space-x-3 bg-zinc-900/50 border border-zinc-800 rounded-lg px-4 py-2">
                 <Loader2 size={14} className="animate-spin text-indigo-500" />
                 <span className="text-xs text-zinc-400 font-medium">
                    Processing batch... ({progress.current}/{progress.total})
                 </span>
                 <div className="w-24 h-1 bg-zinc-800 rounded-full overflow-hidden">
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