import { ChatOllama } from "@langchain/ollama";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ILLMClient } from "./ILLMClient.js";

export class OllamaClient implements ILLMClient {
  constructor(private baseUrl: string) {}

  getModel(modelName: string, temperature: number = 0.7): BaseChatModel {
    return new ChatOllama({
      baseUrl: this.baseUrl,
      model: modelName,
      temperature: temperature,
    });
  }
}
