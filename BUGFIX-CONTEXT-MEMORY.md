# Bug Fix Log: Context & Memory

## 2026-02-03 Bug 1: Old prompts/images affect new turns

### Symptom
- From the second turn on, historical images and prompts are sent together with the new request.
- Old instructions (for example: "remove the cow") keep affecting later turns like a system prompt.

### Root Cause
- `buildHistory` in both `services/geminiService.ts` and `services/openaiService.ts` included:
  - historical user text
  - historical uploaded images
  - historical model text
- Each new request also appended the current user input, so old and new content were mixed in one request.

### Fix
- Do not carry forward historical user text or uploaded images.
- Do not carry forward historical model text.
- Only allow continuation via explicitly selected images.

### Files
- `services/geminiService.ts`
- `services/openaiService.ts`

---

## 2026-02-03 Bug 2: Selected-image follow-up always fails

### Symptom
- When a generated image is selected and used to start a new request, all outputs are `Failed`.

### Root Cause
- Selected images were passed as assistant/model **history** parts.
- After removing prior user text/images, history now started with assistant/model-only image parts.
- This made the request invalid or produced no image output.

### Fix
- Do not send selected images as assistant/model history.
- Inject selected images into the **current user message** as input images.
- Keep history intentionally empty to avoid leaking prior prompts.

### Files
- `services/geminiService.ts`
- `services/openaiService.ts`
