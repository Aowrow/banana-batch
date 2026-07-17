import { useState, useCallback, useRef, useEffect } from 'react';
import type {
  Message,
  AppSettings,
  UploadedImage,
  GenerationSlotDescriptor,
  GenerationSlotResult
} from '../types';
import { logError, serializeGenerationError } from '../utils/errorHandler';
import { runImageGeneration } from '../core/generationEngine';

interface UseImageGenerationOptions {
  onSlotResult: (
    sessionId: string,
    messageId: string,
    result: GenerationSlotResult
  ) => void;
  onTextGenerated: (sessionId: string, messageId: string, text: string) => void;
  getLatestMessages: (sessionId: string) => Message[];
}

export interface MessageGenerationState {
  slotIds: string[];
  abortController: AbortController;
}

export interface GenerationState {
  isGenerating: boolean;
  currentMessageId?: string;
  activeGenerations: Record<string, MessageGenerationState>;
}

const EMPTY_GENERATION_STATE: GenerationState = {
  isGenerating: false,
  currentMessageId: undefined,
  activeGenerations: {}
};

interface ExecuteGenerationOptions {
  sessionId: string;
  prompt: string;
  history: Message[];
  settings: AppSettings;
  modelMessageId: string;
  slots: GenerationSlotDescriptor[];
  uploadedImages?: UploadedImage[];
  errorContext: string;
}

export function useImageGeneration(options: UseImageGenerationOptions) {
  const { onSlotResult, onTextGenerated, getLatestMessages } = options;
  const [generationStates, setGenerationStates] = useState<Record<string, GenerationState>>({});
  const generationStatesRef = useRef(generationStates);

  useEffect(() => {
    generationStatesRef.current = generationStates;
  }, [generationStates]);

  const setSessionState = useCallback(
    (sessionId: string, updater: (previous: GenerationState) => GenerationState) => {
      setGenerationStates((previous) => ({
        ...previous,
        [sessionId]: updater(previous[sessionId] ?? EMPTY_GENERATION_STATE)
      }));
    },
    []
  );

  const executeGeneration = useCallback(
    async ({
      sessionId,
      prompt,
      history,
      settings,
      modelMessageId,
      slots,
      uploadedImages,
      errorContext
    }: ExecuteGenerationOptions) => {
      const controller = new AbortController();
      const settledSlotIds = new Set<string>();

      setSessionState(sessionId, (previous) => ({
        isGenerating: true,
        currentMessageId: modelMessageId,
        activeGenerations: {
          ...previous.activeGenerations,
          [modelMessageId]: {
            slotIds: slots.map((slot) => slot.slotId),
            abortController: controller
          }
        }
      }));

      await new Promise<void>((resolve) => setTimeout(resolve, 0));

      try {
        await runImageGeneration({
          prompt,
          history,
          uploadedImages,
          settings,
          slots,
          signal: controller.signal,
          callbacks: {
            onSlotResult: (result) => {
              settledSlotIds.add(result.slotId);
              onSlotResult(sessionId, modelMessageId, result);
            },
            onText: (text) => onTextGenerated(sessionId, modelMessageId, text)
          }
        });
      } catch (error) {
        logError(errorContext, error);
        const serialized = serializeGenerationError(error, 1);
        for (const slot of slots) {
          if (settledSlotIds.has(slot.slotId)) continue;
          settledSlotIds.add(slot.slotId);
          onSlotResult(sessionId, modelMessageId, {
            ...slot,
            status: 'failed',
            attempts: serialized.attempts,
            error: serialized
          });
        }
      } finally {
        for (const slot of slots) {
          if (settledSlotIds.has(slot.slotId)) continue;
          onSlotResult(sessionId, modelMessageId, controller.signal.aborted
            ? {
                ...slot,
                status: 'cancelled',
                attempts: 0,
                reason: '生成任务已取消。'
              }
            : {
                ...slot,
                status: 'failed',
                attempts: 1,
                error: {
                  kind: 'unknown',
                  message: '生成服务结束，但没有返回该图片的结果。',
                  attempts: 1,
                  retryable: true
                }
              });
        }

        setSessionState(sessionId, (previous) => {
          const { [modelMessageId]: _removed, ...remaining } = previous.activeGenerations;
          const remainingIds = Object.keys(remaining);
          return {
            isGenerating: remainingIds.length > 0,
            currentMessageId: remainingIds.at(-1),
            activeGenerations: remaining
          };
        });
      }
    },
    [onSlotResult, onTextGenerated, setSessionState]
  );

  const generateImages = useCallback(
    async (
      sessionId: string,
      prompt: string,
      settings: AppSettings,
      modelMessageId: string,
      slots: GenerationSlotDescriptor[],
      uploadedImages?: UploadedImage[]
    ) => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      await executeGeneration({
        sessionId,
        prompt,
        history: getLatestMessages(sessionId),
        settings,
        modelMessageId,
        slots,
        uploadedImages,
        errorContext: 'Image Generation'
      });
    },
    [executeGeneration, getLatestMessages]
  );

  const retrySlots = useCallback(
    async (
      sessionId: string,
      prompt: string,
      history: Message[],
      settings: AppSettings,
      modelMessageId: string,
      slots: GenerationSlotDescriptor[],
      uploadedImages?: UploadedImage[]
    ) => executeGeneration({
      sessionId,
      prompt,
      history,
      settings,
      modelMessageId,
      slots,
      uploadedImages,
      errorContext: 'Image Retry'
    }),
    [executeGeneration]
  );

  const stopGeneration = useCallback((sessionId: string) => {
    const state = generationStatesRef.current[sessionId];
    if (!state) return;
    for (const messageId of Object.keys(state.activeGenerations)) {
      state.activeGenerations[messageId].abortController.abort();
    }
  }, []);

  return {
    generationStates,
    generateImages,
    retrySlots,
    stopGeneration
  };
}
