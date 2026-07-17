import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyGenerationSlotResult,
  cancelPendingGenerationSlots,
  createPendingGenerationSlots,
  failPendingGenerationSlots,
  getGenerationSlotProgress,
  markGenerationSlotPending,
  toSlotDescriptors
} from './generationSlots.ts';

test('progress counts every terminal slot as completed', () => {
  const slots = createPendingGenerationSlots(4);
  const descriptors = toSlotDescriptors(slots);
  const image = { id: 'image-1', data: 'data:image/png;base64,AA==', mimeType: 'image/png', status: 'success' as const };
  const withSuccess = applyGenerationSlotResult(slots, {
    ...descriptors[0], status: 'success', attempts: 1, image
  });
  const withFailure = applyGenerationSlotResult(withSuccess, {
    ...descriptors[1], status: 'failed', attempts: 1,
    error: { kind: 'http', message: 'blocked', statusCode: 451, attempts: 1, retryable: false }
  });
  const finalSlots = cancelPendingGenerationSlots(withFailure, [descriptors[2]]);

  assert.deepEqual(getGenerationSlotProgress(finalSlots), {
    total: 4, completed: 3, pending: 1, succeeded: 1, failed: 1, cancelled: 1
  });
});

test('terminal results cannot overwrite an already settled slot', () => {
  const [slot] = createPendingGenerationSlots(1);
  const image = { id: 'image-1', data: 'data:image/png;base64,AA==', mimeType: 'image/png', status: 'success' as const };
  const succeeded = applyGenerationSlotResult([slot], {
    slotId: slot.slotId, index: slot.index, status: 'success', attempts: 1, image
  });
  const unchanged = failPendingGenerationSlots(succeeded, [slot], {
    kind: 'network', message: 'late failure', attempts: 4, retryable: true
  });

  assert.equal(unchanged[0].status, 'success');
});

test('a failed slot retries in place with the same identity and index', () => {
  const [slot] = createPendingGenerationSlots(1, 3);
  const [failed] = failPendingGenerationSlots([slot], [slot], {
    kind: 'http', message: 'invalid request', statusCode: 400, attempts: 1, retryable: false
  });
  const [pending] = markGenerationSlotPending([failed], slot.slotId);

  assert.deepEqual(pending, {
    slotId: slot.slotId, index: 3, status: 'pending', attempts: 0
  });
});

test('three successes and one 451 failure settle all four slots independently', () => {
  const slots = createPendingGenerationSlots(4);
  const descriptors = toSlotDescriptors(slots);
  let settled = slots;

  for (const [index, descriptor] of descriptors.entries()) {
    if (index === 2) {
      settled = applyGenerationSlotResult(settled, {
        ...descriptor,
        status: 'failed',
        attempts: 1,
        error: {
          kind: 'http',
          message: "HTTP 451\nContent blocked by Adobe's safety policy",
          statusCode: 451,
          attempts: 1,
          retryable: false
        }
      });
      continue;
    }

    settled = applyGenerationSlotResult(settled, {
      ...descriptor,
      status: 'success',
      attempts: 1,
      image: {
        id: `image-${index}`,
        data: 'data:image/png;base64,AA==',
        mimeType: 'image/png',
        status: 'success'
      }
    });
  }

  assert.deepEqual(getGenerationSlotProgress(settled), {
    total: 4,
    completed: 4,
    pending: 0,
    succeeded: 3,
    failed: 1,
    cancelled: 0
  });
  assert.equal(settled[2].status, 'failed');
  if (settled[2].status === 'failed') {
    assert.equal(settled[2].error.statusCode, 451);
    assert.match(settled[2].error.message, /Adobe's safety policy/);
  }
});
