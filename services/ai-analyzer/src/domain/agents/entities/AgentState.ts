import { InvestDebateState, RiskDebateState } from "../../shared/types.js";

export interface AgentState {
  messages: any[]; // Using any for LangChain messages for now, will refine in application layer
  marketReport: string;
  sentimentReport: string;
  newsReport: string;
  fundamentalsReport: string;
  investmentPlan: string;
  investmentDebateState: InvestDebateState;
  traderInvestmentPlan: string;
  riskDebateState: RiskDebateState;
  finalTradeDecision: string;
  ticker: string;
  currentDate: string;
  isLastStep: boolean;
}
