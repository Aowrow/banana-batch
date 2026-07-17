import type {
  GeneratedImage,
  GenerationErrorInfo,
  GenerationSlot,
  GenerationSlotDescriptor,
  GenerationSlotResult,
  Message
} from '../types.ts';
import { generateUUID } from '../utils/uuid.ts';

export interface GenerationSlotProgress {
  total: number;
  completed: number;
  pending: number;
  succeeded: number;
  failed: number;
  cancelled: number;
}

export function createPendingGenerationSlots(
  count: number,
  startIndex = 0
): GenerationSlot[] {
  return Array.from({ length: count }, (_, offset) => ({
    slotId: generateUUID(),
    index: startIndex + offset,
    status: 'pending' as const,
    attempts: 0
  }));
}

export function getMessageGenerationSlots(message: Message): GenerationSlot[] {
  if (message.generationSlots) return message.generationSlots;

  return (message.images ?? []).map((image, index) => {
    if (image.status === 'success') {
      return {
        slotId: image.id,
        index,
        status: 'success' as const,
        attempts: 1,
        image
      };
    }

    return {
      slotId: image.id,
      index,
      status: 'failed' as const,
      attempts: 1,
      error: {
        kind: 'unknown' as const,
        message: '旧版本未保存该图片的失败原因。',
        attempts: 1,
        retryable: true
      }
    };
  });
}

export function getSuccessfulImages(message: Message): GeneratedImage[] {
  return getMessageGenerationSlots(message)
    .filter((slot): slot is Extract<GenerationSlot, { status: 'success' }> =>
      slot.status === 'success'
    )
    .sort((left, right) => left.index - right.index)
    .map((slot) => slot.image);
}

export function getGenerationSlotProgress(slots: GenerationSlot[]): GenerationSlotProgress {
  const progress: GenerationSlotProgress = {
    total: slots.length,
    completed: 0,
    pending: 0,
    succeeded: 0,
    failed: 0,
    cancelled: 0
  };

  for (const slot of slots) {
    if (slot.status === 'pending') progress.pending += 1;
    if (slot.status === 'success') progress.succeeded += 1;
    if (slot.status === 'failed') progress.failed += 1;
    if (slot.status === 'cancelled') progress.cancelled += 1;
  }

  progress.completed = progress.succeeded + progress.failed + progress.cancelled;
  return progress;
}

export function toSlotDescriptors(slots: GenerationSlot[]): GenerationSlotDescriptor[] {
  return slots.map(({ slotId, index }) => ({ slotId, index }));
}

export function applyGenerationSlotResult(
  slots: GenerationSlot[],
  result: GenerationSlotResult
): GenerationSlot[] {
  return slots.map((slot) => {
    if (slot.slotId !== result.slotId || slot.status !== 'pending') return slot;

    if (result.status === 'success') {
      return {
        slotId: slot.slotId,
        index: slot.index,
        status: 'success',
        attempts: result.attempts,
        image: result.image
      };
    }

    if (result.status === 'cancelled') {
      return {
        slotId: slot.slotId,
        index: slot.index,
        status: 'cancelled',
        attempts: result.attempts,
        reason: result.reason
      };
    }

    return {
      slotId: slot.slotId,
      index: slot.index,
      status: 'failed',
      attempts: result.attempts,
      error: result.error
    };
  });
}

export function markGenerationSlotPending(
  slots: GenerationSlot[],
  slotId: string
): GenerationSlot[] {
  return slots.map((slot) =>
    slot.slotId === slotId
      ? { slotId: slot.slotId, index: slot.index, status: 'pending', attempts: 0 }
      : slot
  );
}

export function failPendingGenerationSlots(
  slots: GenerationSlot[],
  descriptors: GenerationSlotDescriptor[],
  error: GenerationErrorInfo
): GenerationSlot[] {
  const targetIds = new Set(descriptors.map((descriptor) => descriptor.slotId));
  return slots.map((slot) =>
    targetIds.has(slot.slotId) && slot.status === 'pending'
      ? {
          slotId: slot.slotId,
          index: slot.index,
          status: 'failed',
          attempts: error.attempts,
          error
        }
      : slot
  );
}

export function cancelPendingGenerationSlots(
  slots: GenerationSlot[],
  descriptors: GenerationSlotDescriptor[],
  reason = '生成任务已取消。'
): GenerationSlot[] {
  const targetIds = new Set(descriptors.map((descriptor) => descriptor.slotId));
  return slots.map((slot) =>
    targetIds.has(slot.slotId) && slot.status === 'pending'
      ? {
          slotId: slot.slotId,
          index: slot.index,
          status: 'cancelled',
          attempts: slot.attempts,
          reason
        }
      : slot
  );
}
