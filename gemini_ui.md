# On-device Gemini/Gemma UI notes

Last checked: 2026-04-25

## Reader and goal

This note is for the engineer wiring local AI into the City Wallet frontend.
After reading it, they should be able to choose the correct on-device model
path, understand what works from JavaScript, and avoid accidentally building a
cloud Gemini integration when the product requirement is local inference.

## Naming matters

The public Google docs use three related names that are easy to mix up:

- **Gemma 4** is the open model family that can be downloaded and run locally.
  This is the best match for a bundled on-device wallet humanizer.
- **Gemini Nano** is a browser or OS managed local model exposed through Chrome
  built-in AI APIs and Android AICore. It is not the same thing as bundling
  Gemma 4 yourself.
- **Gemini API** is the hosted cloud API. It is useful as a fallback or server
  feature, but it is not local and should not be called directly from this
  frontend with an API key.

The existing repo language says "on-device Gemini 4 humanizer." For
implementation, treat that as "an on-device local model humanizer." If the
target is a bundled model, use the Gemma 4 docs and LiteRT/MediaPipe tooling.
If the target is a browser-managed model, use Chrome's Gemini Nano APIs and
accept their platform limits.

## What Gemma 4 supports

Gemma 4 is documented as multimodal. The official Gemma 4 model card says:

- All Gemma 4 models accept text and image input.
- Gemma 4 E2B and E4B also accept audio input.
- Output is text.
- The smaller E2B and E4B models are intended for local execution on laptops
  and mobile devices.
- E2B and E4B are the realistic mobile choices. The larger 26B/31B models are
  not a sensible first target for an iPhone wallet flow.

For this wallet, that means text is enough for the first useful feature:
turn a raw offer payload into short display copy. Image input can be added only
when the user flow needs visual context, for example a menu photo or storefront
image. Audio input can support voice preferences or spoken context. Audio
output is not part of Gemma 4 itself; use platform text-to-speech separately if
the UI needs spoken responses.

## Best path for this repo

Use a local model adapter behind the existing offer flow:

1. The backend returns a raw offer from `/offers/generate`.
2. The frontend builds a small local context object from device-side facts such
   as locale, time of day, recent dismissals, and UI language.
3. The local AI adapter humanizes only `headline`, `reason`, and `emoji`.
4. Non-copy fields such as `merchant`, `distance_m`, `discount`, and
   `valid_minutes` pass through unchanged.
5. If the model is missing, slow, unsupported, or returns invalid JSON, the UI
   renders the backend copy.

Do not turn the wallet into a chat UI. The AI should be an invisible copy and
context layer for the offer card.

## JavaScript path 1: MediaPipe LLM Inference for Web

This is the most direct browser JavaScript path for running a downloaded local
model in the React/Vite app.

Use it when:

- You want model files under app assets or a static model CDN.
- You can require WebGPU-compatible browsers.
- You can tolerate large model downloads and first-run loading.
- You want Gemma-family models, including Gemma 4 web-converted artifacts.

Current docs say the MediaPipe LLM Inference Web API:

- runs LLMs completely on-device for web apps;
- uses the `@mediapipe/tasks-genai` npm package;
- requires WebGPU compatibility;
- supports Gemma 4 E2B/E4B web model artifacts through the LiteRT community
  model pages;
- supports multimodal prompting in the Web API, with image/audio examples shown
  for Gemma 3n and notes that Gemma 4 uses a newer prompt format.

Minimal shape:

```js
import { FilesetResolver, LlmInference } from '@mediapipe/tasks-genai'

let localModel = null

export async function loadLocalGemma() {
  if (!navigator.gpu) {
    throw new Error('WebGPU is required for local web LLM inference')
  }

  const genai = await FilesetResolver.forGenAiTasks(
    '/mediapipe/wasm'
  )

  localModel = await LlmInference.createFromOptions(genai, {
    baseOptions: {
      modelAssetPath: '/models/gemma-4-E2B-it-web.task',
    },
    maxTokens: 256,
    topK: 64,
    temperature: 1.0,
  })

  return localModel
}
```

Offer humanizer shape:

```js
const HUMANIZED_OFFER_SCHEMA = {
  headline: 'string, max 54 characters',
  reason: 'string, max 82 characters',
  emoji: 'one emoji or short text fallback',
}

export async function humanizeOffer(rawOffer, deviceContext) {
  if (!localModel) {
    return rawOffer
  }

  const prompt = `
You rewrite one local wallet offer for a phone UI.
Only use facts in the payload. Do not invent hours, prices, menu items, or
merchant claims.
Return only JSON with keys headline, reason, emoji.
Constraints:
- headline: max 54 characters
- reason: max 82 characters
- emoji: one relevant emoji if safe, otherwise empty string

Raw offer:
${JSON.stringify(rawOffer)}

Device context:
${JSON.stringify(deviceContext)}

Output shape:
${JSON.stringify(HUMANIZED_OFFER_SCHEMA)}
`

  try {
    const text = await localModel.generateResponse(prompt)
    const parsed = JSON.parse(text)
    return {
      ...rawOffer,
      headline: sanitizeLine(parsed.headline, rawOffer.headline, 54),
      reason: sanitizeLine(parsed.reason, rawOffer.reason, 82),
      emoji: sanitizeLine(parsed.emoji, rawOffer.emoji, 4),
    }
  } catch {
    return rawOffer
  }
}

function sanitizeLine(value, fallback, maxLength) {
  if (typeof value !== 'string') return fallback
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, '').trim()
  return cleaned.length > 0
    ? Array.from(cleaned).slice(0, maxLength).join('')
    : fallback
}
```

For image/audio input, keep the first version narrow. Add multimodal input only
when the UI has a concrete user action:

```js
const menuImage = document.querySelector('#menu-photo')

const response = await localModel.generateResponse([
  '<start_of_turn>user\n',
  { imageSource: menuImage },
  'Use this image only to describe visible menu context for the offer.',
  '<end_of_turn>\n<start_of_turn>model\n',
])
```

Before using this exact prompt-template form with Gemma 4, verify the current
Gemma 4 prompt formatting guide. The MediaPipe Web guide explicitly notes that
Gemma 4 follows a newer format than older web-converted instruction models.

### Practical web constraints

- The model file is large. Current Gemma 4 E2B LiteRT-LM assets are around the
  2.5 GB class, with a smaller web `.task` artifact listed separately by the
  LiteRT community model page. E4B is larger.
- WebGPU is required for the documented MediaPipe Web path.
- Serve over HTTPS or localhost. WebGPU is a secure-context API.
- Run load/inference in a worker where possible. Model initialization can block
  the main thread.
- Do not assume iPhone Safari, Chrome iOS, Android Chrome, desktop Chrome, and
  desktop Safari behave the same. Feature-detect `navigator.gpu`, test the
  exact device, and provide fallback copy.
- Do not log prompts that contain local user context.

## JavaScript path 2: Chrome built-in AI with Gemini Nano

Chrome exposes Gemini Nano through built-in AI APIs, including the Prompt API.
This is JavaScript and local, but Chrome manages the model. You do not ship a
Gemma 4 model file.

Use it when:

- Desktop Chrome support is enough for a prototype.
- You want lower app bundle/model hosting complexity.
- You are comfortable with origin-trial or experimental API status.
- You accept that the model is Gemini Nano, not Gemma 4.

Do not use it when:

- The target is iPhone. Chrome's docs state that Gemini Nano APIs are not
  available on mobile devices.
- You need deterministic availability across browsers.
- You need to control the exact model artifact.

Minimal shape:

```js
export async function createChromeNanoSession() {
  if (!('LanguageModel' in self)) {
    return null
  }

  const availability = await LanguageModel.availability({
    languages: ['en'],
  })

  if (availability === 'unavailable') {
    return null
  }

  return LanguageModel.create({
    expectedInputs: [{ type: 'text', languages: ['en'] }],
    expectedOutputs: [{ type: 'text', languages: ['en'] }],
  })
}
```

For multimodal Prompt API sessions, Chrome documents `text`, `image`, and
`audio` as possible input types, with text-only output:

```js
const session = await LanguageModel.create({
  expectedInputs: [
    { type: 'text', languages: ['en'] },
    { type: 'image' },
    { type: 'audio' },
  ],
  expectedOutputs: [{ type: 'text', languages: ['en'] }],
})
```

This is useful as a desktop browser experiment. It is not the iPhone path.

## iPhone-specific answer

There are two different iPhone stories:

1. **Testing Gemma 4 on an iPhone today:** use the Google AI Edge Gallery app.
   The App Store listing says the iPhone app supports Gemma 4 and runs offline.
   This is good for validating the product idea and model behavior, not for
   embedding the model into this React PWA.
2. **Shipping Gemma 4 inside your own iPhone app:** use LiteRT-LM or the
   Google AI Edge native stack. The LiteRT-LM docs list CPU and GPU support on
   iOS, and benchmark Gemma4-E2B/E4B on iPhone 17 Pro. The Swift API is marked
   "In Dev" in the LiteRT-LM docs, while C++ is stable. That means a serious
   iOS product should expect native integration work, possibly with a JS bridge
   if the UI is React Native or Capacitor.

A browser-only PWA cannot call a native LiteRT-LM runtime directly. It can only
use browser-exposed APIs such as MediaPipe Web or Chrome built-in AI. For this
repo's Vite PWA, the honest iPhone-compatible architecture is:

- Web prototype: MediaPipe Web + WebGPU + model fallback.
- Native iPhone app: local model in native LiteRT-LM, exposed to JS through a
  native bridge.
- Cloud fallback: backend-mediated Gemini API only if the product explicitly
  allows non-local inference.

## Recommended implementation architecture

Create a frontend adapter with one stable function:

```js
export async function humanizeOfferOnDevice(rawOffer, deviceContext) {
  // 1. Try MediaPipe/Gemma web adapter.
  // 2. Optionally try Chrome Gemini Nano adapter on supported desktop Chrome.
  // 3. Return rawOffer on unsupported devices or model failures.
}
```

The React flow should stay simple:

```js
const rawOffer = await generateOffer()
const displayOffer = await humanizeOfferOnDevice(rawOffer, {
  locale: navigator.language,
  timeOfDay: new Date().toLocaleTimeString(),
  recentDismissals,
})
setOffer(displayOffer)
```

The adapter should return the same shape the card already expects:

```json
{
  "offer_id": "offer_001",
  "merchant": "Cafe Muller",
  "distance_m": 80,
  "headline": "Short humanized headline",
  "discount": "15% off any hot drink",
  "reason": "Short local reason",
  "valid_minutes": 18,
  "emoji": "coffee"
}
```

Keep strict fallback behavior. The model is a UX enhancer, not a dependency for
rendering the offer card.

## UI states to design for

- `unsupported`: no local model path is available, use backend copy.
- `needsDownload`: model exists but must be downloaded or cached.
- `loading`: model is initializing.
- `ready`: local humanization can run.
- `slow`: inference exceeded the UI budget, use backend copy now and update
  later only if that does not shift layout.
- `failed`: parse error, model error, memory pressure, or browser rejection.

For the wallet demo, avoid a visible AI setup wizard. A small passive status in
developer/debug mode is enough. Users should see the offer, not the model.

## Security, privacy, and UX guardrails

- Never expose a Gemini API key in frontend code.
- Never send local device context to the backend as part of humanization unless
  the product requirement changes.
- Keep prompts short and payload-grounded.
- Treat model output as untrusted text: strip control characters, cap length,
  and avoid rendering raw HTML.
- Do not invent merchant facts, opening hours, prices, menu items, or demand
  statistics in the prompt or examples.
- Default to E4B for the app shell. Use E2B when you need a lighter model
  with lower storage and memory pressure.
- Measure on real devices before making any performance claim.

## Source map

- Gemma 4 model card:
  https://ai.google.dev/gemma/docs/core/model_card_4
- Gemma web deployment guide:
  https://ai.google.dev/gemma/docs/integrations/web
- Gemma mobile deployment guide:
  https://ai.google.dev/gemma/docs/integrations/mobile
- MediaPipe LLM Inference Web guide:
  https://ai.google.dev/edge/mediapipe/solutions/genai/llm_inference/web_js
- MediaPipe LLM Inference overview:
  https://ai.google.dev/edge/mediapipe/solutions/genai/llm_inference
- LiteRT-LM overview:
  https://ai.google.dev/edge/litert-lm/overview
- Gemma 4 E2B LiteRT-LM model page:
  https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm
- Gemma 4 E4B LiteRT-LM model page:
  https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm
- Chrome built-in AI overview:
  https://developer.chrome.com/docs/ai/get-started
- Chrome Prompt API:
  https://developer.chrome.com/docs/ai/prompt-api
- MDN WebGPU API:
  https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API
- Google AI Edge Gallery App Store listing:
  https://apps.apple.com/us/app/google-ai-edge-gallery/id6749645337
