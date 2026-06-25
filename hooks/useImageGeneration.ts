import { useState, useCallback, useRef, useEffect } from 'react';
import { Message, AppSettings, UploadedImage, GeneratedImage } from '../types';
import { classifyError, logError } from '../utils/errorHandler';
import { runImageGeneration } from '../core/generationEngine';

interface UseImageGenerationOptions {
  onImageGenerated: (sessionId: string, messageId: string, image: GeneratedImage) => void;
  onTextGenerated: (sessionId: string, messageId: string, text: string) => void;
  onError: (sessionId: string, messageId: string, error: Error) => void;
  getLatestMessages: (sessionId: string) => Message[];
}

interface MessageGenerationState {
  progress: { current: number; total: number };
  abortController: AbortController;
}

interface GenerationState {
  isGenerating: boolean;
  progress: { current: number; total: number } | null;
  currentMessageId?: string;
  activeGenerations: Record<string, MessageGenerationState>;
}

const EMPTY_GENERATION_STATE: GenerationState = {
  isGenerating: false,
  progress: null,
  currentMessageId: undefined,
  activeGenerations: {}
};

/**
 * Custom hook for managing per-session image generation with concurrent task support
 */
export function useImageGeneration(options: UseImageGenerationOptions) {
  const { onImageGenerated, onTextGenerated, onError, getLatestMessages } = options;

  const [generationStates, setGenerationStates] = useState<Record<string, GenerationState>>({});
  const generationStatesRef = useRef<Record<string, GenerationState>>(generationStates);

  useEffect(() => {
    generationStatesRef.current = generationStates;
  }, [generationStates]);

  const setSessionState = useCallback(
    (sessionId: string, updater: (prev: GenerationState) => GenerationState) => {
      setGenerationStates((prev) => {
        const current: GenerationState = prev[sessionId]
          ? {
              ...prev[sessionId],
              activeGenerations: prev[sessionId].activeGenerations || {}
            }
          : { ...EMPTY_GENERATION_STATE };
        const next = updater(current);
        return {
          ...prev,
          [sessionId]: next
        };
      });
    },
    []
  );

  const stopGeneration = useCallback(
    (sessionId: string) => {
      setSessionState(sessionId, (prev) => {
        // Abort all active generations in this session
        const activeGens = prev.activeGenerations || {};
        Object.values(activeGens).forEach((gen) => {
          try {
            gen.abortController.abort();
          } catch (e) {
            // Ignore abort errors
          }
        });

        return {
          isGenerating: false,
          progress: null,
          currentMessageId: undefined,
          activeGenerations: {}
        };
      });
    },
    [setSessionState]
  );

  const generateImages = useCallback(
    async (
      sessionId: string,
      prompt: string,
      settings: AppSettings,
      modelMessageId: string,
      uploadedImages?: UploadedImage[]
    ) => {
      const controller = new AbortController();

      // Add this generation to active generations
      setSessionState(sessionId, (prev) => {
        const activeGenerations = {
          ...(prev.activeGenerations || {}),
          [modelMessageId]: {
            progress: { current: 0, total: settings.batchSize },
            abortController: controller
          }
        };

        return {
          isGenerating: true,
          progress: { current: 0, total: settings.batchSize },
          currentMessageId: modelMessageId,
          activeGenerations
        };
      });

      try {
        const currentMessages = getLatestMessages(sessionId);

        await runImageGeneration({
          prompt,
          history: currentMessages,
          uploadedImages,
          settings,
          signal: controller.signal,
          callbacks: {
            onImage: (image) => {
              onImageGenerated(sessionId, modelMessageId, image);
            },
            onText: (text) => {
              onTextGenerated(sessionId, modelMessageId, text);
            },
            onProgress: (current, total) => {
              setSessionState(sessionId, (prev) => {
                const prevActive = prev.activeGenerations || {};
                const activeGen = prevActive[modelMessageId];
                if (!activeGen) return prev;

                return {
                  ...prev,
                  activeGenerations: {
                    ...prevActive,
                    [modelMessageId]: {
                      ...activeGen,
                      progress: { current, total }
                    }
                  }
                };
              });
            }
          }
        });
      } catch (error) {
        logError('Image Generation', error);

        if (!controller.signal.aborted) {
          const classifiedError = classifyError(error);
          onError(sessionId, modelMessageId, classifiedError);
        }
      } finally {
        // Remove this generation from active generations
        setSessionState(sessionId, (prev) => {
          const prevActive = prev.activeGenerations || {};
          const { [modelMessageId]: _removed, ...remainingGenerations } = prevActive;
          const remainingKeys = Object.keys(remainingGenerations);
          const hasActiveGenerations = remainingKeys.length > 0;

          // Pick the most recent remaining generation as the current one
          let nextProgress: { current: number; total: number } | null = null;
          let nextCurrentMessageId: string | undefined = undefined;
          if (hasActiveGenerations) {
            const lastKey = remainingKeys[remainingKeys.length - 1];
            nextProgress = remainingGenerations[lastKey].progress;
            nextCurrentMessageId = lastKey;
          }

          return {
            isGenerating: hasActiveGenerations,
            progress: nextProgress,
            currentMessageId: nextCurrentMessageId,
            activeGenerations: remainingGenerations
          };
        });
      }
    },
    [getLatestMessages, onImageGenerated, onTextGenerated, onError, setSessionState]
  );

  const retryGeneration = useCallback(
    async (
      sessionId: string,
      prompt: string,
      history: Message[],
      settings: AppSettings,
      modelMessageId: string,
      currentImageCount: number,
      uploadedImages?: UploadedImage[]
    ) => {
      const controller = new AbortController();

      // Add this generation to active generations
      setSessionState(sessionId, (prev) => {
        const activeGenerations = {
          ...(prev.activeGenerations || {}),
          [modelMessageId]: {
            progress: {
              current: currentImageCount,
              total: currentImageCount + settings.batchSize
            },
            abortController: controller
          }
        };

        return {
          isGenerating: true,
          progress: {
            current: currentImageCount,
            total: currentImageCount + settings.batchSize
          },
          currentMessageId: modelMessageId,
          activeGenerations
        };
      });

      try {
        await runImageGeneration({
          prompt,
          history,
          uploadedImages,
          settings,
          signal: controller.signal,
          callbacks: {
            onImage: (image) => {
              onImageGenerated(sessionId, modelMessageId, image);
            },
            onText: (text) => {
              onTextGenerated(sessionId, modelMessageId, text);
            },
            onProgress: (current, total) => {
              setSessionState(sessionId, (prev) => {
                const prevActive = prev.activeGenerations || {};
                const activeGen = prevActive[modelMessageId];
                if (!activeGen) return prev;

                return {
                  ...prev,
                  activeGenerations: {
                    ...prevActive,
                    [modelMessageId]: {
                      ...activeGen,
                      progress: {
                        current: currentImageCount + current,
                        total: currentImageCount + total
                      }
                    }
                  }
                };
              });
            }
          }
        });
      } catch (error) {
        logError('Image Retry', error);

        if (!controller.signal.aborted) {
          const classifiedError = classifyError(error);
          onError(sessionId, modelMessageId, classifiedError);
        }
      } finally {
        // Remove this generation from active generations
        setSessionState(sessionId, (prev) => {
          const prevActive = prev.activeGenerations || {};
          const { [modelMessageId]: _removed, ...remainingGenerations } = prevActive;
          const remainingKeys = Object.keys(remainingGenerations);
          const hasActiveGenerations = remainingKeys.length > 0;

          let nextProgress: { current: number; total: number } | null = null;
          let nextCurrentMessageId: string | undefined = undefined;
          if (hasActiveGenerations) {
            const lastKey = remainingKeys[remainingKeys.length - 1];
            nextProgress = remainingGenerations[lastKey].progress;
            nextCurrentMessageId = lastKey;
          }

          return {
            isGenerating: hasActiveGenerations,
            progress: nextProgress,
            currentMessageId: nextCurrentMessageId,
            activeGenerations: remainingGenerations
          };
        });
      }
    },
    [onImageGenerated, onTextGenerated, onError, setSessionState]
  );

  return {
    generationStates,
    generateImages,
    retryGeneration,
    stopGeneration
  };
}
