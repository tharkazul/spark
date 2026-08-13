const { GoogleGenAI } = require("@google/genai");
const db = require("./db");

// --- GEMINI LOAD BALANCER REGISTRY ---
const geminiConfigs = [
  {
    name: "Primary (Key 1)",
    model: "gemini-3.5-flash",
    apiKey: process.env.GEMINI_API_KEY, // Your main key
  },
  {
    name: "Primary (Key 2)",
    model: "gemini-3.5-flash",
    apiKey: process.env.GEMINI_API_KEY2 || process.env.GEMINI_API_KEY,
  },
  {
    name: "Backup (Key 1)",
    model: "gemini-2.5-flash",
    apiKey: process.env.GEMINI_API_KEY_BACKUP || process.env.GEMINI_API_KEY, // Uses backup key if it exists, otherwise re-uses the main one
  },
  {
    name: "Backup (Key 2)",
    model: "gemini-2.5-flash",
    apiKey: process.env.GEMINI_API_KEY2 || process.env.GEMINI_API_KEY_BACKUP || process.env.GEMINI_API_KEY,
  },
  {
    name: "Tertiary (Key 1)",
    model: "gemini-3.1-flash-lite",
    apiKey:
      process.env.GEMINI_API_KEY_TERTIARY ||
      process.env.GEMINI_API_KEY_BACKUP ||
      process.env.GEMINI_API_KEY,
  },
  {
    name: "Tertiary (Key 2)",
    model: "gemini-3.1-flash-lite",
    apiKey:
      process.env.GEMINI_API_KEY2 ||
      process.env.GEMINI_API_KEY_TERTIARY ||
      process.env.GEMINI_API_KEY_BACKUP ||
      process.env.GEMINI_API_KEY,
  },
  {
    name: "Quaternary (Key 1)",
    model: "gemini-3-flash",
    apiKey:
      process.env.GEMINI_API_KEY_QUATERNARY ||
      process.env.GEMINI_API_KEY_TERTIARY ||
      process.env.GEMINI_API_KEY_BACKUP ||
      process.env.GEMINI_API_KEY,
  },
  {
    name: "Quaternary (Key 2)",
    model: "gemini-3-flash",
    apiKey:
      process.env.GEMINI_API_KEY2 ||
      process.env.GEMINI_API_KEY_QUATERNARY ||
      process.env.GEMINI_API_KEY_TERTIARY ||
      process.env.GEMINI_API_KEY_BACKUP ||
      process.env.GEMINI_API_KEY,
  },
  {
    name: "Quinary (Key 1)",
    model: "gemini-2.5-flash-lite",
    apiKey:
      process.env.GEMINI_API_KEY_QUINARY ||
      process.env.GEMINI_API_KEY_QUATERNARY ||
      process.env.GEMINI_API_KEY_TERTIARY ||
      process.env.GEMINI_API_KEY_BACKUP ||
      process.env.GEMINI_API_KEY,
  },
  {
    name: "Quinary (Key 2)",
    model: "gemini-2.5-flash-lite",
    apiKey:
      process.env.GEMINI_API_KEY2 ||
      process.env.GEMINI_API_KEY_QUINARY ||
      process.env.GEMINI_API_KEY_QUATERNARY ||
      process.env.GEMINI_API_KEY_TERTIARY ||
      process.env.GEMINI_API_KEY_BACKUP ||
      process.env.GEMINI_API_KEY,
  },
];

async function generateWithFallback(
  prompt,
  systemInstruction = null,
  chatHistory = null,
  imagesBase64 = null,
  userId = null,
  poolType = "personal",
  isJson = false
) {
  let lastError = null;

  for (let i = 0; i < geminiConfigs.length; i++) {
    const config = geminiConfigs[i];

    try {
      console.log(
        `🤖 Attempting AI generation with ${config.name} (${config.model})...`,
      );

      const ai = new GoogleGenAI({ apiKey: config.apiKey });

      // Build model options
      const genConfig = {};
      if (systemInstruction) {
        genConfig.systemInstruction = systemInstruction;
      }
      if (isJson) {
        genConfig.responseMimeType = "application/json";
      }

      let result;

      let promptContent = prompt;
      if (imagesBase64 && Array.isArray(imagesBase64) && imagesBase64.length > 0) {
        promptContent = [{ text: prompt }];
        for (const img of imagesBase64) {
          promptContent.push({ inlineData: { data: img, mimeType: "image/jpeg" } });
        }
      }

      if (chatHistory) {
        // If history is provided, use the Chat interface
        const chat = ai.chats.create({
            model: config.model,
            config: genConfig,
            history: chatHistory
        });
        result = await chat.sendMessage({ message: promptContent });
      } else {
        // Otherwise, use a standard single-shot prompt
        result = await ai.models.generateContent({
            model: config.model,
            contents: promptContent,
            config: genConfig
        });
      }

      // Log Token Usage to terminal for monitoring
      const usage = result.usageMetadata;
      if (usage) {
        console.log(
          `🪙 Tokens Used -> Input: ${usage.promptTokenCount} | Output: ${usage.candidatesTokenCount} | Total: ${usage.totalTokenCount}`,
        );
        if (userId) {
          const columnToUpdate = poolType === "common" ? "common_token_usage" : "daily_token_usage";
          db.run(
            `UPDATE users SET ${columnToUpdate} = ${columnToUpdate} + ? WHERE id = ?`,
            [usage.totalTokenCount, userId],
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
    "Spark is currently catching their breath. Please try again in a moment.",
  );
}

module.exports = { generateWithFallback, geminiConfigs };
