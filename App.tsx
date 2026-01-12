import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Message, AppSettings, GeneratedImage } from './types';
import { generateImageBatchStream } from './services/geminiService';
import MessageList from './components/MessageList';
import InputArea from './components/InputArea';
import SettingsPanel from './components/SettingsPanel';
import { Banana } from 'lucide-react';
import { generateUUID } from './utils/uuid';

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<{current: number, total: number} | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Theme State: Load from local storage or default to 'dark'
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('app_theme') as 'light' | 'dark') || 'dark';
  });

  useEffect(() => {
    // Apply theme to document
    document.documentElement.classList.toggle('light', theme === 'light');
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('app_theme', theme);
  }, [theme]);
  
  // API Key State: Load from local storage only (for security, not from build-time env vars)
  // 安全说明：API Key 只从 localStorage 读取，不会从构建时的环境变量注入
  // 这样可以避免 API Key 暴露在前端代码中
  const [apiKey, setApiKey] = useState<string>(() => {
    // 只从 localStorage 读取，确保 API Key 不会出现在构建后的代码中
    return localStorage.getItem('user_gemini_api_key') || '';
  });

  const handleApiKeyChange = useCallback((key: string) => {
    setApiKey(key);
    if (key) {
        localStorage.setItem('user_gemini_api_key', key);
    } else {
        localStorage.removeItem('user_gemini_api_key');
    }
  }, []);

  const [settings, setSettings] = useState<AppSettings>({ 
    batchSize: 2,
    aspectRatio: 'Auto',
    resolution: '1K'
  });

  const updateSettings = useCallback((updates: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
  }, []);

  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
        setIsGenerating(false);
        setProgress(null);
    }
  }, []);

  const handleSend = useCallback(async (text: string, images?: import('./types').UploadedImage[]) => {
    console.log('App handleSend called', { 
      text, 
      imagesCount: images?.length || 0, 
      apiKey: !!apiKey,
      apiKeyLength: apiKey?.length || 0,
      isGenerating 
    });
    
    if (isGenerating) {
      console.warn('Already generating, ignoring send request');
      return;
    }
    
    if (!apiKey) {
        // Create a temporary system message to alert the user
        const alertMsg: Message = {
            id: generateUUID(),
            role: 'model',
            text: "⚠️ Please configure your Gemini API Key in the settings (top right Key icon) to start generating images.",
            textVariations: [],
            timestamp: Date.now(),
            isError: true
        };
        setMessages(prev => [...prev, { 
          id: generateUUID(), 
          role: 'user', 
          text, 
          uploadedImages: images,
          timestamp: Date.now() 
        }, alertMsg]);
        return;
    }

    // 1. Add User Message
    const userMsg: Message = {
      id: generateUUID(),
      role: 'user',
      text: text || undefined,
      uploadedImages: images,
      timestamp: Date.now()
    };
    
    // 2. Prepare Placeholder Model Message
    const modelMsgId = generateUUID();
    const modelMsg: Message = {
      id: modelMsgId,
      role: 'model',
      text: undefined,
      textVariations: [],
      images: [],
      generationSettings: {
        aspectRatio: settings.aspectRatio
      },
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg, modelMsg]);
    setIsGenerating(true);
    setProgress({ current: 0, total: settings.batchSize });

    // 3. Setup AbortController
    abortControllerRef.current = new AbortController();

    try {
      // Get current messages state for history
      const currentMessages = messages;
      
      await generateImageBatchStream(
        apiKey, // Pass the key explicitly
        text || '', 
        currentMessages, 
        settings,
        images,
        {
            onImage: (newImage: GeneratedImage) => {
                setMessages(prev => prev.map(msg => {
                    if (msg.id === modelMsgId) {
                        const updatedImages = [...(msg.images || []), newImage];
                        return { 
                            ...msg, 
                            images: updatedImages
                        };
                    }
                    return msg;
                }));
            },
            onText: (newText: string) => {
                setMessages(prev => prev.map(msg => {
                    if (msg.id === modelMsgId) {
                        const currentVariations = msg.textVariations || [];
                        // Dedup text
                        if (!currentVariations.includes(newText)) {
                             const nextVariations = [...currentVariations, newText];
                             return {
                                 ...msg,
                                 text: nextVariations[0], // Always display the first one
                                 textVariations: nextVariations
                             };
                        }
                    }
                    return msg;
                }));
            },
            onProgress: (current, total) => {
                setProgress({ current, total });
            }
        },
        abortControllerRef.current.signal
      );

    } catch (error: any) {
      console.error("Generation loop error:", error);
      // If it wasn't an abort, show error
      if (!abortControllerRef.current?.signal.aborted) {
          setMessages(prev => prev.map(msg => {
              if (msg.id === modelMsgId) {
                  const errorText = error.message?.includes('API Key') 
                    ? "Invalid API Key. Please check your settings." 
                    : "Generation failed.";
                  return { ...msg, isError: true, text: msg.text || errorText };
              }
              return msg;
          }));
      }
    } finally {
      // Only reset if we haven't already stopped manually (which handles this)
      if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
          setIsGenerating(false);
          setProgress(null);
          abortControllerRef.current = null;
      }
    }
  }, [messages, settings, apiKey, isGenerating]);

  const handleSelectImage = useCallback((messageId: string, imageId: string) => {
    setMessages(prev => prev.map(msg => {
      if (msg.id === messageId) {
        // Toggle selection: if clicking already selected, deselect it (return to undefined).
        // This allows users to "undo" a selection and see all images clearly again.
        const newSelection = msg.selectedImageId === imageId ? undefined : imageId;
        return { ...msg, selectedImageId: newSelection };
      }
      return msg;
    }));
  }, []);

  // Retry: incrementally add more images to existing model message
  const handleRetry = useCallback(async (modelMessageId: string) => {
    if (isGenerating) return;
    
    // Find the model message and its corresponding user message
    const modelMsgIndex = messages.findIndex(msg => msg.id === modelMessageId);
    if (modelMsgIndex === -1 || messages[modelMsgIndex].role !== 'model') return;
    
    // Find the user message that precedes this model message
    let userMsgIndex = -1;
    for (let i = modelMsgIndex - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        userMsgIndex = i;
        break;
      }
    }
    
    if (userMsgIndex === -1) return;
    
    const userMsg = messages[userMsgIndex];
    const modelMsg = messages[modelMsgIndex];
    
    if (!apiKey) {
      setMessages(prev => prev.map(msg => {
        if (msg.id === modelMessageId) {
          return { 
            ...msg, 
            isError: true, 
            text: msg.text || "⚠️ Please configure your Gemini API Key in the settings (top right Key icon) to start generating images."
          };
        }
        return msg;
      }));
      return;
    }

    // Get history up to (but not including) this user message
    const history = messages.slice(0, userMsgIndex);
    
    // Set generating state for this specific message
    setIsGenerating(true);
    const currentImageCount = modelMsg.images?.length || 0;
    setProgress({ current: currentImageCount, total: currentImageCount + settings.batchSize });

    // Setup AbortController
    abortControllerRef.current = new AbortController();

    try {
      await generateImageBatchStream(
        apiKey,
        userMsg.text || '', 
        history, 
        settings,
        userMsg.uploadedImages,
        {
          onImage: (newImage: GeneratedImage) => {
            // Incrementally add new images to existing model message
            setMessages(prev => prev.map(msg => {
              if (msg.id === modelMessageId) {
                const updatedImages = [...(msg.images || []), newImage];
                return { ...msg, images: updatedImages };
              }
              return msg;
            }));
          },
          onText: (newText: string) => {
            setMessages(prev => prev.map(msg => {
              if (msg.id === modelMessageId) {
                const currentVariations = msg.textVariations || [];
                if (!currentVariations.includes(newText)) {
                  const nextVariations = [...currentVariations, newText];
                  return {
                    ...msg,
                    text: nextVariations[0] || msg.text,
                    textVariations: nextVariations
                  };
                }
              }
              return msg;
            }));
          },
          onProgress: (current, total) => {
            setProgress({ current: currentImageCount + current, total: currentImageCount + total });
          }
        },
        abortControllerRef.current.signal
      );
    } catch (error: any) {
      console.error("Generation loop error:", error);
      if (!abortControllerRef.current?.signal.aborted) {
        setMessages(prev => prev.map(msg => {
          if (msg.id === modelMessageId) {
            const errorText = error.message?.includes('API Key') 
              ? "Invalid API Key. Please check your settings." 
              : "Generation failed.";
            return { ...msg, isError: true, text: msg.text || errorText };
          }
          return msg;
        }));
      }
    } finally {
      if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
        setIsGenerating(false);
        setProgress(null);
        abortControllerRef.current = null;
      }
    }
  }, [messages, isGenerating, apiKey, settings]);

  // Delete message(s) up to a certain point
  const handleDeleteMessages = useCallback((messageId: string) => {
    // Find the index of the message to delete
    const messageIndex = messages.findIndex(msg => msg.id === messageId);
    if (messageIndex === -1) return;
    
    // Delete this message and all messages after it
    setMessages(prev => prev.slice(0, messageIndex));
  }, [messages]);

  // Clear all messages (reset context)
  const handleClearAll = useCallback(() => {
    if (isGenerating) {
      handleStop();
    }
    setMessages([]);
  }, [isGenerating, handleStop]);

  return (
    <div className={`flex flex-col h-screen transition-colors duration-200 ${
      theme === 'light' 
        ? 'bg-gray-50 text-gray-900' 
        : 'bg-zinc-950 text-zinc-200'
    }`}>
      {/* Header */}
      <header className={`flex-none px-6 py-4 flex items-center justify-between border-b backdrop-blur-md sticky top-0 z-50 transition-colors duration-200 ${
        theme === 'light'
          ? 'border-gray-200 bg-white/80'
          : 'border-zinc-800 bg-zinc-950/80'
      }`}>
        <div className="flex items-center space-x-3">
          <div className="bg-yellow-400 p-1.5 rounded-lg text-black">
            <Banana size={20} className="fill-black" />
          </div>
          <div className="hidden sm:block">
            <h1 className={`font-bold text-lg leading-tight tracking-tight ${
              theme === 'light' ? 'text-gray-900' : 'text-zinc-200'
            }`}>Banana Batch</h1>
            <p className={`text-xs font-medium ${
              theme === 'light' ? 'text-gray-500' : 'text-zinc-500'
            }`}>NanoBanana Image Generator • Parallel Generation</p>
          </div>
        </div>

        <SettingsPanel 
          settings={settings} 
          updateSettings={updateSettings}
          apiKey={apiKey}
          onApiKeyChange={handleApiKeyChange}
          theme={theme}
          onThemeChange={setTheme}
          onClearAll={handleClearAll}
          hasMessages={messages.length > 0}
        />
      </header>

      {/* Main Chat */}
      <main className="flex-1 flex flex-col min-h-0 relative">
        <MessageList 
          messages={messages} 
          isGenerating={isGenerating} 
          progress={progress}
          onSelectImage={handleSelectImage}
          onRetry={handleRetry}
          onDeleteMessage={handleDeleteMessages}
          theme={theme}
          currentGeneratingMessageId={isGenerating && messages.length > 0 ? messages[messages.length - 1].id : undefined}
        />
        
        {/* Input Area (Sticky) */}
        <div className="flex-none z-40">
           <InputArea onSend={handleSend} onStop={handleStop} disabled={isGenerating} theme={theme} />
        </div>
      </main>
    </div>
  );
};

export default App;