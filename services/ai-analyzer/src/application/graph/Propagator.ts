import { AgentState } from "../../domain/agents/entities/AgentState.js";

export const createInitialState = (
  ticker: string,
  date: string,
): AgentState => {
  return {
    messages: [],
    marketReport: "",
    sentimentReport: "",
    newsReport: "",
    fundamentalsReport: "",
    investmentPlan: "",
    investmentDebateState: {
      bullHistory: [],
      bearHistory: [],
      judgeDecision: "HOLD",
    },
    traderInvestmentPlan: "",
    riskDebateState: {
      conservativeHistory: [],
      aggressiveHistory: [],
      neutralHistory: [],
      judgeDecision: "HOLD",
    },
    finalTradeDecision: "",
    ticker,
    currentDate: date,
    isLastStep: false,
  };
};
