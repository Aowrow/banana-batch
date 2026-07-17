import assert from 'node:assert/strict';
import test from 'node:test';
import { serializeGenerationError } from '../utils/errorHandler.ts';

test('400 and 451 errors preserve API details and do not retry', () => {
  const badRequest = serializeGenerationError({
    status: 400,
    error: { message: 'The composition contains disallowed content.' }
  }, 1);
  const blocked = serializeGenerationError({
    status: 451,
    error: { message: "Content blocked by Adobe's safety policy" }
  }, 1);

  assert.equal(badRequest.statusCode, 400);
  assert.equal(badRequest.retryable, false);
  assert.match(badRequest.message, /HTTP 400/);
  assert.match(badRequest.message, /disallowed content/);

  assert.equal(blocked.statusCode, 451);
  assert.equal(blocked.retryable, false);
  assert.match(blocked.message, /HTTP 451/);
  assert.match(blocked.message, /Adobe's safety policy/);
});

test('429 and server errors remain retryable', () => {
  const rateLimited = serializeGenerationError({
    status: 429,
    error: { message: 'Rate limit exceeded.' }
  }, 1);
  const unavailable = serializeGenerationError({
    status: 503,
    error: { message: 'Service unavailable.' }
  }, 1);

  assert.equal(rateLimited.retryable, true);
  assert.equal(unavailable.retryable, true);
});
