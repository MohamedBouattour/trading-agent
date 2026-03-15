import { StateGraph, END, START } from "@langchain/langgraph";
import { AgentState } from "../../domain/agents/entities/AgentState.js";
import { ConditionalLogic } from "./ConditionalLogic.js";

export class GraphSetup {
  constructor(private logic: ConditionalLogic) {}

  compile(nodes: any) {
    const workflow = new StateGraph<AgentState>({
      channels: {
        messages: { value: (a: any, b: any) => a.concat(b), default: () => [] },
        marketReport: { value: (a, b) => b || a, default: () => "" },
        sentimentReport: { value: (a, b) => b || a, default: () => "" },
        newsReport: { value: (a, b) => b || a, default: () => "" },
        fundamentalsReport: { value: (a, b) => b || a, default: () => "" },
        investmentPlan: { value: (a, b) => b || a, default: () => "" },
        investmentDebateState: {
          value: (a, b) => ({ ...a, ...b }),
          default: () => ({
            bullHistory: [],
            bearHistory: [],
            judgeDecision: "HOLD",
          }),
        },
        traderInvestmentPlan: { value: (a, b) => b || a, default: () => "" },
        riskDebateState: {
          value: (a, b) => ({ ...a, ...b }),
          default: () => ({
            conservativeHistory: [],
            aggressiveHistory: [],
            neutralHistory: [],
            judgeDecision: "HOLD",
          }),
        },
        finalTradeDecision: { value: (a, b) => b || a, default: () => "" },
        ticker: { value: (a, b) => b || a, default: () => "" },
        currentDate: { value: (a, b) => b || a, default: () => "" },
        isLastStep: { value: (a, b) => b || a, default: () => false },
      },
    });

    // Add Nodes
    workflow.addNode("marketAnalyst", nodes.marketAnalyst);
    workflow.addNode("socialAnalyst", nodes.socialAnalyst);
    workflow.addNode("newsAnalyst", nodes.newsAnalyst);
    workflow.addNode("fundamentalsAnalyst", nodes.fundamentalsAnalyst);

    workflow.addNode("bullResearcher", nodes.bullResearcher);
    workflow.addNode("bearResearcher", nodes.bearResearcher);
    workflow.addNode("researchManager", nodes.researchManager);

    workflow.addNode("trader", nodes.trader);

    workflow.addNode("aggressiveRiskDebater", nodes.aggressiveRiskDebater);
    workflow.addNode("conservativeRiskDebater", nodes.conservativeRiskDebater);
    workflow.addNode("neutralRiskDebater", nodes.neutralRiskDebater);
    workflow.addNode("riskManager", nodes.riskManager);

    // Initial Parallel Analysts
    workflow.addEdge(START, "marketAnalyst");
    workflow.addEdge("marketAnalyst", "socialAnalyst");
    workflow.addEdge("socialAnalyst", "newsAnalyst");
    workflow.addEdge("newsAnalyst", "fundamentalsAnalyst");
    workflow.addEdge("fundamentalsAnalyst", "bullResearcher");

    // Investment Debate Loop
    workflow.addConditionalEdges(
      "bullResearcher",
      (state) => this.logic.shouldContinueInvestmentDebate(state),
      {
        bearResearcher: "bearResearcher",
        researchManager: "researchManager",
      },
    );

    workflow.addConditionalEdges(
      "bearResearcher",
      (state) => this.logic.shouldContinueInvestmentDebate(state),
      {
        bullResearcher: "bullResearcher",
        researchManager: "researchManager",
      },
    );

    workflow.addEdge("researchManager", "trader");

    // Risk Debate Loop
    workflow.addEdge("trader", "aggressiveRiskDebater");

    workflow.addConditionalEdges(
      "aggressiveRiskDebater",
      (state) => this.logic.shouldContinueRiskDebate(state),
      {
        conservativeRiskDebater: "conservativeRiskDebater",
        neutralRiskDebater: "neutralRiskDebater",
        riskManager: "riskManager",
      },
    );

    workflow.addConditionalEdges(
      "conservativeRiskDebater",
      (state) => this.logic.shouldContinueRiskDebate(state),
      {
        aggressiveRiskDebater: "aggressiveRiskDebater",
        neutralRiskDebater: "neutralRiskDebater",
        riskManager: "riskManager",
      },
    );

    workflow.addConditionalEdges(
      "neutralRiskDebater",
      (state) => this.logic.shouldContinueRiskDebate(state),
      {
        aggressiveRiskDebater: "aggressiveRiskDebater",
        conservativeRiskDebater: "conservativeRiskDebater",
        riskManager: "riskManager",
      },
    );

    workflow.addEdge("riskManager", END);

    return workflow.compile();
  }
}
