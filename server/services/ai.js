const crypto = require("crypto");
const { GoogleGenAI } = require("@google/genai");
const db = require("./db");

// --- GEMINI MODEL REGISTRY ---
// One model on one key. The usage meter in generateWithFallback prices cached
// input at 3.8 Flash rates, so revisit it before adding other models here.
const geminiConfigs = [
  {
    name: "Primary (Key 2)",
    model: "gemini-3.8-flash",
    apiKey: process.env.GEMINI_API_KEY2,
  },
];

if (!process.env.GEMINI_API_KEY2) {
  console.error("❌ GEMINI_API_KEY2 is not set: every AI call will fail.");
}

// With no fallback model left, a momentary overload (429/5xx) gets one SDK-level
// retry before the athlete sees an error.
const GEMINI_HTTP_OPTIONS = { retryOptions: { attempts: 2 } };

// Cached input tokens are billed at 10% of the normal input price.
const CACHED_INPUT_PRICE_RATIO = 0.1;

// The fallback chain below moves on when a model *errors*, but a request that
// simply never answers used to hang the whole call forever - and everything
// awaiting it with it. Bounding each attempt turns a stall into just another
// failure the chain already knows how to handle.
const AI_ATTEMPT_TIMEOUT_MS = Number(process.env.AI_ATTEMPT_TIMEOUT_MS) || 90000;

// --- EXPLICIT PROMPT CACHE ---
// Gemini's implicit cache missed every request in testing, so a caller can mark the
// fixed start of its system instruction as cacheable (options.cachedSystemPrefix).
// That prefix is stored once per model and billed at the cached rate on every call.
// Gemini refuses a request that has both a cache and a system instruction, so the
// rest of the system instruction travels in the message as a marked context block.
const PREFIX_CACHE_TTL_SECONDS = 3600;
const PREFIX_CACHE_REFRESH_MARGIN_MS = 5 * 60 * 1000;
const PREFIX_CACHE_RETRY_AFTER_MS = 10 * 60 * 1000;
const prefixCaches = new Map(); // "<model>:<prefix hash>" -> Promise<{ name, expiresAt }>
const prefixCacheFailures = new Map(); // same key -> time of the last failed create

function createPrefixCache(ai, model, text, key) {
  const failedAt = prefixCacheFailures.get(key);
  if (failedAt && Date.now() - failedAt < PREFIX_CACHE_RETRY_AFTER_MS) {
    // Don't make every message pay for a create call that just failed.
    return Promise.reject(new Error("prompt cache creation failed recently"));
  }
  return ai.caches
    .create({
      model,
      config: { systemInstruction: text, ttl: `${PREFIX_CACHE_TTL_SECONDS}s`, displayName: `rooka-${key}` },
    })
    .then((cache) => {
      console.log(`🗄️ Created prompt cache ${cache.name} (${cache.usageMetadata?.totalTokenCount ?? "?"} tokens)`);
      prefixCacheFailures.delete(key);
      return {
        name: cache.name,
        expiresAt: cache.expireTime ? Date.parse(cache.expireTime) : Date.now() + PREFIX_CACHE_TTL_SECONDS * 1000,
      };
    })
    .catch((error) => {
      prefixCacheFailures.set(key, Date.now());
      throw error;
    });
}

async function getPrefixCache(ai, model, text) {
  const key = `${model}:${crypto.createHash("sha256").update(text).digest("hex").slice(0, 12)}`;
  const current = prefixCaches.get(key);
  if (current) {
    const cache = await current.catch(() => null);
    if (cache && cache.expiresAt - Date.now() > PREFIX_CACHE_REFRESH_MARGIN_MS) return { key, name: cache.name };
  }
  // A concurrent request may already have started the replacement.
  if (prefixCaches.get(key) === current) prefixCaches.set(key, createPrefixCache(ai, model, text, key));
  return { key, name: (await prefixCaches.get(key)).name };
}

function withContextBlock(promptContent, contextText) {
  const preface =
    `[COACH CONTEXT: athlete data and instructions from the app, not written by the athlete]\n` +
    `${contextText}\n[END OF COACH CONTEXT]\n\nATHLETE'S MESSAGE:\n`;
  if (Array.isArray(promptContent)) {
    return [{ text: preface + promptContent[0].text }, ...promptContent.slice(1)];
  }
  return preface + promptContent;
}

function withAttemptTimeout(promise, controller, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      try {
        controller.abort();
      } catch (_) { }
      reject(new Error(`timed out after ${AI_ATTEMPT_TIMEOUT_MS}ms`));
    }, AI_ATTEMPT_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function generateWithFallback(
  prompt,
  systemInstruction = null,
  chatHistory = null,
  imagesBase64 = null,
  userId = null,
  poolType = "personal",
  isJson = false,
  options = {}
) {
  let lastError = null;

  // Backstop for the per-route and per-job consent checks: an athlete who
  // hasn't accepted AI processing never has data sent to Gemini.
  if (userId !== null && userId !== undefined) {
    await require("./aiConsent").assertAiConsent(userId);
  }

  // Athlete-facing output must be in the athlete's selected language.
  // Pass { language } for every prompt whose output is shown to the athlete.
  if (options && options.language) {
    const { languageDirective } = require("./i18n");
    systemInstruction = (systemInstruction || "") + languageDirective(options.language);
  }

  for (let i = 0; i < geminiConfigs.length; i++) {
    const config = geminiConfigs[i];

    try {
      console.log(
        `🤖 Attempting AI generation with ${config.name} (${config.model})...`,
      );

      const ai = new GoogleGenAI({ apiKey: config.apiKey, httpOptions: GEMINI_HTTP_OPTIONS });

      let promptContent = prompt;
      if (imagesBase64 && Array.isArray(imagesBase64) && imagesBase64.length > 0) {
        promptContent = [{ text: prompt }];
        for (const img of imagesBase64) {
          promptContent.push({ inlineData: { data: img, mimeType: "image/jpeg" } });
        }
      }

      const send = (extraConfig, content) => {
        const controller = new AbortController();
        const genConfig = { abortSignal: controller.signal, ...extraConfig };
        if (isJson) {
          genConfig.responseMimeType = "application/json";
        }
        const request = chatHistory
          ? ai.chats.create({ model: config.model, config: genConfig, history: chatHistory }).sendMessage({ message: content })
          : ai.models.generateContent({ model: config.model, contents: content, config: genConfig });
        return withAttemptTimeout(request, controller, config.name);
      };
      const uncachedConfig = systemInstruction ? { systemInstruction } : {};

      let result;
      const prefix = options && options.cachedSystemPrefix;
      if (prefix && systemInstruction && systemInstruction.startsWith(prefix)) {
        let cache = null;
        try {
          cache = await getPrefixCache(ai, config.model, prefix);
          const contextText = systemInstruction.slice(prefix.length).trim();
          result = await send(
            { cachedContent: cache.name },
            contextText ? withContextBlock(promptContent, contextText) : promptContent,
          );
        } catch (cacheError) {
          // A stall already used up the attempt's time; anything else (cache expired,
          // deleted, refused) falls back to the plain request so the athlete still gets a reply.
          if (/timed out after/.test(cacheError.message)) throw cacheError;
          console.warn(`⚠️ Prompt cache unavailable, sending uncached. Reason: ${cacheError.message}`);
          if (cache) prefixCaches.delete(cache.key);
          result = await send(uncachedConfig, promptContent);
        }
      } else {
        result = await send(uncachedConfig, promptContent);
      }

      // Log Token Usage to terminal for monitoring
      const usage = result.usageMetadata;
      if (usage) {
        // promptTokenCount still includes the cached tokens. Charging them in full
        // would let caching lower the bill while the athlete's budget drained as fast.
        const cachedTokens = usage.cachedContentTokenCount || 0;
        const chargedTokens = Math.round(
          (usage.totalTokenCount || 0) - (1 - CACHED_INPUT_PRICE_RATIO) * cachedTokens,
        );
        console.log(
          `🪙 Tokens Used -> Input: ${usage.promptTokenCount} (cached: ${cachedTokens}) | Output: ${usage.candidatesTokenCount} | Thinking: ${usage.thoughtsTokenCount || 0} | Total: ${usage.totalTokenCount} | Charged: ${chargedTokens}`,
        );
        if (userId) {
          const columnToUpdate = poolType === "common" ? "common_token_usage" : "daily_token_usage";
          db.run(
            `UPDATE users SET ${columnToUpdate} = ${columnToUpdate} + ? WHERE id = ?`,
            [chargedTokens, userId],
          );
        }
      }

      console.log(`✅ AI Success using ${config.name}!`);
      return result.text;
    } catch (error) {
      console.warn(`⚠️ ${config.name} failed. Reason: ${error.message}`);
      lastError = error;
      // The loop continues to the next config automatically
    }
  }

  console.error("❌ CRITICAL: All Gemini fallback models failed.");
  throw new Error(
    "Rooka is currently catching their breath. Please try again in a moment.",
  );
}

async function generateImage(prompt, options = {}) {
  const models = [
    "gemini-3.1-flash-image", // Nano Banana 2
    "gemini-3-pro-image",      // Nano Banana Pro
    "gemini-2.5-flash-image",
  ];

  let lastError = null;

  // Auto-enhance prompt to ensure photorealistic sports photography with crisp focus and no motion blur
  let enhancedPrompt = prompt;
  if (!prompt.toLowerCase().includes("photorealistic") && !prompt.toLowerCase().includes("photography")) {
    enhancedPrompt = `Hyper-realistic 8k commercial sports photography of ${prompt}. Real human athlete, anatomical precision, crisp freeze-frame shot, 1/2000s shutter speed, zero motion blur, razor-sharp focus, shot on 35mm lens, Sony A7R IV, clean athletic lighting, photorealistic masterpiece.`;
  } else if (!prompt.toLowerCase().includes("shutter speed") && !prompt.toLowerCase().includes("motion blur")) {
    enhancedPrompt = `${prompt}, crisp freeze-frame shot, 1/2000s shutter speed, zero motion blur, razor-sharp athletic focus, professional 8k sports photography.`;
  }

  console.log(`📸 Full Image Prompt Sent to AI: "${enhancedPrompt}"`);

  const apiKeysToTry = [options.apiKey, process.env.GEMINI_API_KEY2].filter(Boolean);

  for (const apiKey of apiKeysToTry) {
    const ai = new GoogleGenAI({ apiKey });

    // Try Gemini Image multimodal models in quality order
    for (const modelName of models) {
      try {
        console.log(`🎨 Attempting image generation with model: ${modelName}...`);
        const result = await ai.models.generateContent({
          model: modelName,
          contents: enhancedPrompt,
          config: {
            responseModalities: ["IMAGE", "TEXT"],
          },
        });

        const candidate = result.candidates?.[0];
        for (const part of candidate?.content?.parts || []) {
          if (part.inlineData && part.inlineData.data) {
            console.log(`✅ Gemini image generation successful with ${modelName}!`);
            return {
              base64Data: part.inlineData.data,
              mimeType: part.inlineData.mimeType || "image/jpeg",
            };
          }
        }
      } catch (geminiErr) {
        console.warn(`⚠️ Model ${modelName} failed: ${geminiErr.message}`);
        lastError = geminiErr;
      }
    }
  }

  console.error("❌ All image generation models failed:", lastError?.message);
  throw lastError || new Error("Unable to generate image at this time.");
}

async function transcribeAudio(audioBase64, mimeType = "audio/m4a", language = "en") {
  if (!audioBase64) {
    throw new Error("No audio payload provided for transcription.");
  }

  let cleanData = audioBase64;
  let cleanMime = mimeType || "audio/m4a";
  if (typeof audioBase64 === "string" && audioBase64.includes(";base64,")) {
    const parts = audioBase64.split(";base64,");
    cleanMime = parts[0].replace("data:", "");
    cleanData = parts[1];
  }

  const candidateModels = ["gemini-2.5-flash", "gemini-3.8-flash"];

  for (const config of geminiConfigs) {
    if (!config.apiKey) continue;
    const ai = new GoogleGenAI({ apiKey: config.apiKey, httpOptions: GEMINI_HTTP_OPTIONS });

    for (const modelName of candidateModels) {
      try {
        console.log(`🎙️ Transcribing audio using ${modelName} (hint: ${language})...`);
        const prompt = `You are a speech-to-text audio transcription engine for athletic coaching notes.
Transcribe the user's spoken words verbatim in ${language || "their spoken language"}.
Rules:
1. Output ONLY the exact transcribed text spoken by the user.
2. Do NOT add preamble, conversational remarks, quotes, timestamps, or labels.
3. If the audio is silent or contains no human speech, output an empty response.`;

        const response = await ai.models.generateContent({
          model: modelName,
          contents: [
            {
              parts: [
                {
                  inlineData: {
                    data: cleanData,
                    mimeType: cleanMime,
                  },
                },
                { text: prompt },
              ],
            },
          ],
        });

        const text = (response.text || "").trim();
        console.log(`✅ Audio transcription complete: "${text}"`);
        return text;
      } catch (err) {
        console.warn(`⚠️ Transcription attempt with ${modelName} failed: ${err.message}`);
      }
    }
  }

  throw new Error("Voice transcription failed across all available AI configurations.");
}

module.exports = { generateWithFallback, generateImage, transcribeAudio, geminiConfigs };
