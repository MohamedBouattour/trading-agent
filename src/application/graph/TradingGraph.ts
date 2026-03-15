import { LLMFactory } from "../../infrastructure/llm/LLMFactory.js";
import { BinanceClient } from "../../infrastructure/binance/BinanceClient.js";
import { BinanceMarketAdapter } from "../../infrastructure/binance/BinanceMarketAdapter.js";
import { FinancialSituationMemory } from "../memory/FinancialSituationMemory.js";
import { createMarketTools } from "../tools/MarketTools.js";
import { createNewsTools } from "../tools/NewsTools.js";
import { createFundamentalsTools } from "../tools/FundamentalsTools.js";
import { createAnalysts } from "../agents/analysts/AnalystImplementation.js";
import { createResearchers } from "../agents/researchers/ResearcherImplementation.js";
import { createDecisionMakers } from "../agents/managers/ManagerImplementation.js";
import { createRiskAgents } from "../agents/risk/RiskImplementation.js";
import { ConditionalLogic } from "./ConditionalLogic.js";
import { GraphSetup } from "./GraphSetup.js";
import { createInitialState } from "./Propagator.js";
import { SignalProcessor } from "./SignalProcessor.js";

export interface TradingGraphConfig {
  llmProvider: string;
  openrouterApiKey?: string;
  rateLimitDelayMs?: number;
  googleApiKey?: string;
  deepThinkModel: string;
  quickThinkModel: string;
  embeddingModel: string;
  binanceApiKey?: string;
  binanceApiSecret?: string;
  maxDebateRounds: number;
  maxRiskRounds: number;
}

export class TradingGraph {
  private graph: any;
  private signalProcessor: SignalProcessor;

  constructor(config: TradingGraphConfig) {
    // 1. Infrastructure
    const binanceClient = new BinanceClient(
      config.binanceApiKey,
      config.binanceApiSecret,
    );
    const marketProvider = new BinanceMarketAdapter(binanceClient);

    const llmClient = LLMFactory.createLLMClient(
      config.llmProvider,
      config.openrouterApiKey,
      config.rateLimitDelayMs,
      config.googleApiKey,
    );

    const deepModel = llmClient.getModel(config.deepThinkModel);
    const quickModel = llmClient.getModel(config.quickThinkModel);

    // 2. Application
    const memory = new FinancialSituationMemory({
      apiKey: config.openrouterApiKey || "",
      embeddingModel: config.embeddingModel,
    });

    const marketTools = createMarketTools(marketProvider);
    const newsTools = createNewsTools();
    const fundamentalsTools = createFundamentalsTools(marketProvider);

    const analysts = createAnalysts(quickModel, {
      market: marketTools,
      news: newsTools,
      fundamentals: fundamentalsTools,
    });

    const researchers = createResearchers(quickModel);
    const managers = createDecisionMakers(deepModel);
    const riskAgents = createRiskAgents(deepModel);

    const allNodes = {
      ...analysts,
      ...researchers,
      ...managers,
      ...riskAgents,
    };

    const logic = new ConditionalLogic(
      config.maxDebateRounds,
      config.maxRiskRounds,
    );
    const setup = new GraphSetup(logic);

    this.graph = setup.compile(allNodes);
    this.signalProcessor = new SignalProcessor(quickModel);
  }

  async *runStream(ticker: string, date: string) {
    const initialState = createInitialState(ticker, date);
    const stream = await this.graph.stream(initialState, {
      streamMode: "values",
    });

    for await (const value of stream) {
      yield value;
    }
  }

  async getSignal(text: string) {
    return this.signalProcessor.extractSignal(text);
  }

  async run(ticker: string, date: string) {
    const initialState = createInitialState(ticker, date);
    const finalState = await this.graph.invoke(initialState);

    // Extract final signal
    const signal = await this.signalProcessor.extractSignal(
      finalState.finalTradeDecision,
    );

    return { finalState, signal };
  }
}
