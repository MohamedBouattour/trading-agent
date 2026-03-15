export type Signal = "BUY" | "SELL" | "HOLD";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export interface InvestDebateState {
  bullHistory: string[];
  bearHistory: string[];
  judgeDecision: Signal | "HOLD";
}

export interface RiskDebateState {
  conservativeHistory: string[];
  aggressiveHistory: string[];
  neutralHistory: string[];
  judgeDecision: Signal | "HOLD";
}
