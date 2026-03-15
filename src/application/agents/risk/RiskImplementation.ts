import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AgentState } from "../../../domain/agents/entities/AgentState.js";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

// Helper for Risk Debaters
const createRiskDebaterPrompt = (
  role: string,
  goal: string,
  traderDecision: string,
  reports: any,
  history: string,
  others: string,
) => `As the ${role}, ${goal}. Here is the trader's decision:

${traderDecision}

Your task is to create a compelling case... (rest of the prompt template from plan.md §8.9-8.11) ...

Market Research Report: ${reports.market}
Social Media Sentiment Report: ${reports.sentiment}
Latest World Affairs Report: ${reports.news}
Company Fundamentals Report: ${reports.fundamentals}

Here is the current conversation history: ${history}
${others}

... (rest of the prompt template from plan.md §8.9-8.11) ...`;

// §8.9 Aggressive Risk Debater
// §8.10 Conservative Risk Debater
// §8.11 Neutral Risk Debater

export const createRiskAgents = (model: BaseChatModel) => {
  const aggressiveDebater = async (state: AgentState) => {
    // ... Implementation similar to researchers but for risk debate
    const response = await model.invoke([
      new HumanMessage("Aggressive Risk Debater prompt..."),
    ]);
    return {
      riskDebateState: {
        ...state.riskDebateState,
        aggressiveHistory: [
          ...state.riskDebateState.aggressiveHistory,
          response.content as string,
        ],
      },
    };
  };

  const conservativeDebater = async (state: AgentState) => {
    const response = await model.invoke([
      new HumanMessage("Conservative Risk Debater prompt..."),
    ]);
    return {
      riskDebateState: {
        ...state.riskDebateState,
        conservativeHistory: [
          ...state.riskDebateState.conservativeHistory,
          response.content as string,
        ],
      },
    };
  };

  const neutralDebater = async (state: AgentState) => {
    const response = await model.invoke([
      new HumanMessage("Neutral Risk Debater prompt..."),
    ]);
    return {
      riskDebateState: {
        ...state.riskDebateState,
        neutralHistory: [
          ...state.riskDebateState.neutralHistory,
          response.content as string,
        ],
      },
    };
  };

  const riskManager = async (state: AgentState) => {
    const history =
      state.riskDebateState.aggressiveHistory.join("\n") +
      state.riskDebateState.conservativeHistory.join("\n") +
      state.riskDebateState.neutralHistory.join("\n");
    const pastMemory = "";
    const prompt = `As the Risk Management Judge... (Prompt from §8.12) ... Original Plan: ${state.traderInvestmentPlan} ... History: ${history}`;

    const response = await model.invoke([new HumanMessage(prompt)]);

    return {
      finalTradeDecision: response.content as string,
    };
  };

  return {
    aggressiveRiskDebater: aggressiveDebater,
    conservativeRiskDebater: conservativeDebater,
    neutralRiskDebater: neutralDebater,
    riskManager: riskManager,
  };
};
