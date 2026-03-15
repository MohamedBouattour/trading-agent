import { ChatOpenAI } from "@langchain/openai";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { Runnable } from "@langchain/core/runnables";
import { ILLMClient } from "./ILLMClient.js";
import axios from "axios";

export interface OpenRouterModel {
  id: string;
  name: string;
  pricing: {
    prompt: string;
    completion: string;
  };
}

export class OpenRouterClient implements ILLMClient {
  constructor(
    private apiKey: string,
    private delayMs: number = 0,
  ) {}

  async getModels(): Promise<OpenRouterModel[]> {
    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }
    const response = await axios.get("https://openrouter.ai/api/v1/models", {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });
    return response.data.data;
  }

  getModel(
    modelName: string,
    temperature: number = 0.7,
    fallbackModel?: BaseChatModel,
  ): Runnable {
    const primaryModel = new ChatOpenAI({
      openAIApiKey: this.apiKey,
      modelName: modelName,
      temperature: temperature,
      configuration: {
        baseURL: "https://openrouter.ai/api/v1",
        defaultHeaders: {
          "HTTP-Referer": "https://github.com/TradingAgentsTS",
          "X-Title": "TradingAgents TS",
        },
        fetch: async (url: any, init?: any) => {
          if (this.delayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, this.delayMs));
          }
          return fetch(url, init);
        },
      },
    });

    if (fallbackModel) {
      return primaryModel.withFallbacks({ fallbacks: [fallbackModel] });
    }

    return primaryModel;
  }
}
