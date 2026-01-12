import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Message, AppSettings, GeneratedImage } from './types';
import { generateImageBatchStream } from './services/geminiService';
import MessageList from './components/MessageList';
import InputArea from './components/InputArea';
import SettingsPanel from './components/SettingsPanel';
import { Banana } from 'lucide-react';

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<{current: number, total: number} | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // API Key State: Load from local storage or fall back to empty string
  const [apiKey, setApiKey] = useState<string>(() => {
    return localStorage.getItem('user_gemini_api_key') || process.env.API_KEY || '';
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

  const handleSend = useCallback(async (text: string) => {
    if (!apiKey) {
        // Create a temporary system message to alert the user
        const alertMsg: Message = {
            id: crypto.randomUUID(),
            role: 'model',
            text: "⚠️ Please configure your Gemini API Key in the settings (top right Key icon) to start generating images.",
            textVariations: [],
            timestamp: Date.now(),
            isError: true
        };
        setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'user', text, timestamp: Date.now() }, alertMsg]);
        return;
    }

    // 1. Add User Message
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      text: text,
      timestamp: Date.now()
    };
    
    // 2. Prepare Placeholder Model Message
    const modelMsgId = crypto.randomUUID();
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
      await generateImageBatchStream(
        apiKey, // Pass the key explicitly
        text, 
        messages, 
        settings,
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
  }, [messages, settings, apiKey]);

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

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-200">
      {/* Header */}
      <header className="flex-none px-6 py-4 flex items-center justify-between border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center space-x-3">
          <div className="bg-yellow-400 p-1.5 rounded-lg text-black">
            <Banana size={20} className="fill-black" />
          </div>
          <div className="hidden sm:block">
            <h1 className="font-bold text-lg leading-tight tracking-tight">Banana Batch</h1>
            <p className="text-xs text-zinc-500 font-medium">Gemini 2.5 Flash Image • Parallel Generation</p>
          </div>
        </div>

        <SettingsPanel 
          settings={settings} 
          updateSettings={updateSettings}
          apiKey={apiKey}
          onApiKeyChange={handleApiKeyChange}
        />
      </header>

      {/* Main Chat */}
      <main className="flex-1 flex flex-col min-h-0 relative">
        <MessageList 
          messages={messages} 
          isGenerating={isGenerating} 
          progress={progress}
          onSelectImage={handleSelectImage} 
        />
        
        {/* Input Area (Sticky) */}
        <div className="flex-none z-40">
           <InputArea onSend={handleSend} onStop={handleStop} disabled={isGenerating} />
        </div>
      </main>
    </div>
  );
};

export default App;