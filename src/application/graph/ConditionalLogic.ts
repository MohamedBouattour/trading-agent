import { AgentState } from "../../domain/agents/entities/AgentState.js";

export class ConditionalLogic {
  constructor(
    private maxDebateRounds: number,
    private maxRiskRounds: number,
  ) {}

  shouldContinueInvestmentDebate(state: AgentState) {
    if (
      state.investmentDebateState.bullHistory.length >= this.maxDebateRounds &&
      state.investmentDebateState.bearHistory.length >= this.maxDebateRounds
    ) {
      return "researchManager";
    }
    // Route back to whoever needs to speak next
    if (
      state.investmentDebateState.bullHistory.length >
      state.investmentDebateState.bearHistory.length
    ) {
      return "bearResearcher";
    }
    return "bullResearcher";
  }

  shouldContinueRiskDebate(state: AgentState) {
    if (
      state.riskDebateState.aggressiveHistory.length >= this.maxRiskRounds &&
      state.riskDebateState.conservativeHistory.length >= this.maxRiskRounds &&
      state.riskDebateState.neutralHistory.length >= this.maxRiskRounds
    ) {
      return "riskManager";
    }
    // Simple rotation for risk debaters
    const counts = [
      state.riskDebateState.aggressiveHistory.length,
      state.riskDebateState.conservativeHistory.length,
      state.riskDebateState.neutralHistory.length,
    ];
    const min = Math.min(...counts);
    if (counts[0] === min) return "aggressiveRiskDebater";
    if (counts[1] === min) return "conservativeRiskDebater";
    return "neutralRiskDebater";
  }
}
