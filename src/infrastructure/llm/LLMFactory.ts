import { ILLMClient } from "./ILLMClient.js";
import { OpenRouterClient } from "./OpenRouterClient.js";
import { GeminiClient } from "./GeminiClient.js";

export class LLMFactory {
  static createLLMClient(
    provider: string,
    apiKey?: string,
    delayMs: number = 0,
    googleApiKey?: string,
  ): ILLMClient {
    if (provider === "gemini" || provider === "vertexai") {
      // GeminiClient uses Google AI Studio API key (GOOGLE_API_KEY).
      // Get your free key at: https://aistudio.google.com/apikey
      return new GeminiClient(googleApiKey);
    }

    if (!apiKey)
      throw new Error("OpenRouter API Key is required for OpenRouter provider");

    return new OpenRouterClient(apiKey, delayMs);
  }
}
