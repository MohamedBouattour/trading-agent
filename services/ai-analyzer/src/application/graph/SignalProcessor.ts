import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { Signal } from "../../domain/shared/types.js";

// §8.13 Signal Processor
export class SignalProcessor {
  constructor(private model: BaseChatModel) {}

  async extractSignal(fullDecisionText: string): Promise<Signal> {
    const systemPrompt = `You are an efficient assistant designed to analyze paragraphs or financial reports provided by a group of analysts. Your task is to extract the investment decision: SELL, BUY, or HOLD. Provide only the extracted decision (SELL, BUY, or HOLD) as your output, without adding any additional text or information.`;

    const response = await this.model.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(fullDecisionText),
    ]);

    const signal = (response.content as string).toUpperCase().trim();
    if (signal === "BUY" || signal === "SELL" || signal === "HOLD") {
      return signal as Signal;
    }
    return "HOLD"; // Default safety
  }
}
