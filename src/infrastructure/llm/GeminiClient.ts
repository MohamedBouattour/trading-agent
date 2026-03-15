import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ILLMClient } from "./ILLMClient.js";

/**
 * GeminiClient uses Google AI Studio API key (GOOGLE_API_KEY).
 * Get your free API key at: https://aistudio.google.com/apikey
 * Set it in .env as: GOOGLE_API_KEY=your-key-here
 */
export class GeminiClient implements ILLMClient {
  constructor(private apiKey?: string) {}

  async getModels(): Promise<any[]> {
    return [
      { id: "gemini-2.5-flash", name: "Google Gemini 2.5 Flash" },
      { id: "gemini-2.0-flash-lite", name: "Google Gemini 2.0 Flash Lite" },
      { id: "gemini-2.5-pro", name: "Google Gemini 2.5 Pro" },
    ];
  }

  getModel(
    modelName: string = "gemini-2.5-flash",
    temperature: number = 0.7,
  ): any {
    return new ChatGoogleGenerativeAI({
      model: modelName,
      temperature: temperature,
      maxRetries: 2,
      apiKey: this.apiKey,
    });
  }
}
