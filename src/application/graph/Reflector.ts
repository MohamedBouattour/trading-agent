import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { IMemoryStore } from "../../domain/ports/Ports.js";
import { AgentState } from "../../domain/agents/entities/AgentState.js";

export class Reflector {
  constructor(
    private model: BaseChatModel,
    private memory: IMemoryStore,
  ) {}

  async reflect(state: AgentState, realizedReturns: number) {
    const systemPrompt = `You are an expert financial analyst tasked with reviewing trading decisions/analysis... (Full Reflector prompt from plan.md §8.14) ...`;

    // In practice, we'd run this for bull, bear, trader, judge, but for now we'll do once
    const situation = `Ticker: ${state.ticker}, Date: ${state.currentDate}\nMarket: ${state.marketReport.slice(0, 500)}...`;
    const report = state.finalTradeDecision;

    const userPrompt = `Returns: ${realizedReturns}\n\nAnalysis/Decision: ${report}\n\nObjective Market Reports: ${situation}`;

    const response = await this.model.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt),
    ]);

    const reflection = response.content as string;
    await this.memory.addSituation(situation, reflection);

    return reflection;
  }
}
