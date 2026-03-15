# TypeScript Clean DDD TradingAgents — Full Project Plan

> **Inspired by:** [`TradingAgents` (Python)](https://github.com/TauricResearch/TradingAgents)
> **Data source:** Binance API (replaces yfinance / Alpha Vantage)
> **LLM backends:** OpenRouter (cloud) | Ollama (local)
> **Architecture:** Clean Architecture + Domain-Driven Design (DDD)

---

## 1. Vision & Goals

| Goal                | Detail                                                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Same agent topology | Market, Social, News, Fundamentals analysts → Bull/Bear researchers → Research Manager → Trader → Risk Debaters (Aggressive / Neutral / Conservative) → Risk Judge |
| Same workflow       | LangGraph-style state machine, debate rounds, reflection & memory                                                                                                  |
| Data source swap    | Replace yfinance/Alpha Vantage with **Binance REST/WebSocket API** (OHLCV, orderbook, trades, news via third-party)                                                |
| LLM flexibility     | Factory pattern: **OpenRouter** (any cloud model) or **Ollama** (local models)                                                                                     |
| Language            | **TypeScript** (Node.js ≥ 20)                                                                                                                                      |
| Architecture        | Hexagonal (Ports & Adapters) + Clean DDD layers                                                                                                                    |
| CLI                 | Interactive terminal UI (Ink / Inquirer) mirroring Python's rich CLI                                                                                               |

---

## 2. Tech Stack

| Layer               | Library / Tool                                                              |
| ------------------- | --------------------------------------------------------------------------- |
| Language            | TypeScript 5.x                                                              |
| Runtime             | Node.js ≥ 20                                                                |
| Package manager     | pnpm                                                                        |
| Agent orchestration | **LangGraph.js** (`@langchain/langgraph`)                                   |
| LLM SDK             | **LangChain.js** (`langchain`, `@langchain/openai`, `@langchain/community`) |
| Ollama              | `ollama` npm package OR `@langchain/community` Ollama client                |
| OpenRouter          | OpenAI-compatible, uses `@langchain/openai` with custom `baseURL`           |
| Binance API         | `@binance/connector` or direct `axios` REST + `ws` for WebSocket            |
| Vector memory       | `@langchain/community` with local **ChromaDB** or in-memory store           |
| CLI                 | `ink` + `inquirer`                                                          |
| Validation          | `zod`                                                                       |
| Config              | `dotenv` + `zod` schema                                                     |
| Build               | `tsup` (ESM + CJS output)                                                   |
| Testing             | `vitest`                                                                    |
| Linting             | `eslint` + `@typescript-eslint`                                             |
| Formatting          | `prettier`                                                                  |

---

## 3. Clean DDD Layer Map

```
src/
├── domain/                   # Pure business logic — NO I/O
│   ├── agents/               # Agent domain models & interfaces
│   │   ├── entities/         # AgentState, TradeDecision, DebateState, etc.
│   │   ├── value-objects/    # Signal, Sentiment, Risk level
│   │   └── ports/            # IAnalyst, IResearcher, ITrader, IMemory (interfaces)
│   ├── market/               # Market domain
│   │   ├── entities/         # Candle, Ticker, OrderBook
│   │   └── ports/            # IMarketDataProvider (interface)
│   └── shared/               # Shared kernel
│       └── types.ts
│
├── application/              # Use-cases / orchestration
│   ├── graph/                # State machine (LangGraph.js)
│   │   ├── TradingGraph.ts   # Main orchestrator (= trading_graph.py)
│   │   ├── GraphSetup.ts     # Node wiring (= setup.py)
│   │   ├── ConditionalLogic.ts
│   │   ├── Propagator.ts
│   │   ├── Reflector.ts
│   │   └── SignalProcessor.ts
│   ├── agents/               # Concrete agent logic (uses domain ports)
│   │   ├── analysts/
│   │   │   ├── MarketAnalyst.ts
│   │   │   ├── SocialAnalyst.ts
│   │   │   ├── NewsAnalyst.ts
│   │   │   └── FundamentalsAnalyst.ts
│   │   ├── researchers/
│   │   │   ├── BullResearcher.ts
│   │   │   └── BearResearcher.ts
│   │   ├── risk/
│   │   │   ├── AggressiveDebater.ts
│   │   │   ├── NeutralDebater.ts
│   │   │   └── ConservativeDebater.ts
│   │   ├── managers/
│   │   │   ├── ResearchManager.ts
│   │   │   └── RiskManager.ts
│   │   └── trader/
│   │       └── Trader.ts
│   └── memory/
│       └── FinancialSituationMemory.ts
│
├── infrastructure/           # I/O adapters (implements domain ports)
│   ├── binance/              # Binance adapter (implements IMarketDataProvider)
│   │   ├── BinanceClient.ts
│   │   ├── BinanceMarketAdapter.ts
│   │   └── BinanceNewsAdapter.ts
│   ├── llm/                  # LLM clients (factory)
│   │   ├── ILLMClient.ts
│   │   ├── OpenRouterClient.ts   # OpenAI-compatible, uses OPENROUTER_API_KEY
│   │   ├── OllamaClient.ts       # Local Ollama
│   │   └── LLMFactory.ts
│   └── persistence/
│       ├── JsonStateLogger.ts    # Saves state to JSON (eval_results/)
│       └── VectorMemoryStore.ts  # ChromaDB / in-memory
│
├── cli/                      # CLI entry point
│   ├── main.ts               # Main CLI (Ink / Inquirer)
│   ├── config.ts             # Config loader (dotenv + zod)
│   └── utils.ts
│
└── index.ts                  # Public API entry point
```

---

## 4. Domain Entities & State Shape

### 4.1 AgentState (mirrors Python TypedDict)

```typescript
// src/domain/agents/entities/AgentState.ts
export interface AgentState {
  messages: BaseMessage[];
  ticker: string; // e.g. "BTCUSDT"
  tradeDate: string; // ISO date
  marketReport: string;
  sentimentReport: string;
  newsReport: string;
  fundamentalsReport: string;
  investmentDebateState: InvestDebateState;
  riskDebateState: RiskDebateState;
  traderInvestmentPlan: string;
  investmentPlan: string;
  finalTradeDecision: string;
}

export interface InvestDebateState {
  bullHistory: string;
  bearHistory: string;
  history: string;
  currentResponse: string;
  judgeDecision: string;
  count: number;
}

export interface RiskDebateState {
  aggressiveHistory: string;
  conservativeHistory: string;
  neutralHistory: string;
  history: string;
  judgeDecision: string;
  count: number;
}
```

### 4.2 Market Data Entities

```typescript
// src/domain/market/entities/Candle.ts
export interface Candle {
  openTime: number;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  closeTime: number;
}
```

---

## 5. Infrastructure: Binance Adapter

Replaces all yfinance / Alpha Vantage calls with Binance REST API.

| Python tool                | TypeScript equivalent               | Binance endpoint                                     |
| -------------------------- | ----------------------------------- | ---------------------------------------------------- |
| `get_stock_data`           | `getOHLCV(symbol, interval, limit)` | `GET /api/v3/klines`                                 |
| `get_indicators`           | `getTechnicalIndicators(symbol)`    | Computed from klines using `technicalindicators` npm |
| `get_fundamentals`         | `getExchangeInfo(symbol)`           | `GET /api/v3/exchangeInfo`                           |
| `get_news`                 | `getCryptoNews(symbol)`             | CoinGecko free API / RSS feeds                       |
| `get_global_news`          | `getGlobalMarketNews()`             | CryptoPanic API (free tier)                          |
| `get_insider_transactions` | `getLargeTradesOnChain(symbol)`     | Whale Alert API (optional)                           |

```typescript
// src/infrastructure/binance/BinanceMarketAdapter.ts
export class BinanceMarketAdapter implements IMarketDataProvider {
  async getOHLCV(symbol: string, interval: string, limit = 100): Promise<Candle[]> { ... }
  async getOrderBook(symbol: string): Promise<OrderBook> { ... }
  async getTicker24h(symbol: string): Promise<Ticker> { ... }
}
```

---

## 6. Infrastructure: LLM Factory

```typescript
// src/infrastructure/llm/LLMFactory.ts
export type LLMProvider = "openrouter" | "ollama";

export function createLLMClient(
  provider: LLMProvider,
  model: string,
): BaseChatModel {
  if (provider === "openrouter") {
    return new ChatOpenAI({
      modelName: model,
      openAIApiKey: process.env.OPENROUTER_API_KEY,
      configuration: {
        baseURL: "https://openrouter.ai/api/v1",
        defaultHeaders: {
          "HTTP-Referer": "https://tradingagents.local",
          "X-Title": "TradingAgentsTS",
        },
      },
    });
  }
  if (provider === "ollama") {
    return new ChatOllama({
      baseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
      model,
    });
  }
  throw new Error(`Unsupported provider: ${provider}`);
}
```

---

## 7. Application: TradingGraph (LangGraph.js)

```typescript
// src/application/graph/TradingGraph.ts
import { StateGraph, END, START } from "@langchain/langgraph";

export class TradingGraph {
  private graph: CompiledStateGraph;

  constructor(config: TradingAgentsConfig) {
    const deepLLM = createLLMClient(config.llmProvider, config.deepThinkModel);
    const quickLLM = createLLMClient(
      config.llmProvider,
      config.quickThinkModel,
    );
    this.graph = new GraphSetup(quickLLM, deepLLM, config).build(
      config.selectedAnalysts,
    );
  }

  async propagate(ticker: string, tradeDate: string): Promise<PropagateResult> {
    const initState = Propagator.createInitialState(ticker, tradeDate);
    const finalState = await this.graph.invoke(initState, {
      recursionLimit: 100,
    });
    return {
      finalState,
      signal: SignalProcessor.process(finalState.finalTradeDecision),
    };
  }

  async reflectAndRemember(
    result: PropagateResult,
    returnsLosses: number,
  ): Promise<void> {
    await Reflector.reflectAll(result.finalState, returnsLosses, this.memories);
  }
}
```

### 7.1 Agent Graph Topology (same as Python)

```
START
  └─► Market Analyst ◄──► tools_market
         │ (clear msgs)
         ▼
      Social Analyst ◄──► tools_social
         │ (clear msgs)
         ▼
       News Analyst ◄──► tools_news
         │ (clear msgs)
         ▼
   Fundamentals Analyst ◄──► tools_fundamentals
         │ (clear msgs)
         ▼
   Bull Researcher ◄──────┐
         │ (debate rounds) │
         ▼                 │
   Bear Researcher ────────┘
         │ (judge)
         ▼
   Research Manager
         │
         ▼
       Trader
         ▼
  Aggressive Debater ◄──┐
         │              │
         ▼ (rounds)     │
  Conservative Debater ─┤
         │              │
         ▼              │
    Neutral Debater ────┘
         │ (judge)
         ▼
    Risk Judge
         │
        END
```

---

## 8. Complete Agent Prompts (Verbatim from Python Source)

All prompts below are extracted from the original Python project. In the TypeScript version, use them **as-is**, adapting only the template variable syntax (`{variable}` → `${variable}`).

---

### 8.0 Shared Collaboration Prefix (All Analysts)

Every analyst agent receives this **system prefix** before their specific instructions:

```
You are a helpful AI assistant, collaborating with other assistants.
Use the provided tools to progress towards answering the question.
If you are unable to fully answer, that's OK; another assistant with different tools
will help where you left off. Execute what you can to make progress.
If you or any other assistant has the FINAL TRANSACTION PROPOSAL: **BUY/HOLD/SELL** or deliverable,
prefix your response with FINAL TRANSACTION PROPOSAL: **BUY/HOLD/SELL** so the team knows to stop.
You have access to the following tools: {tool_names}.
{system_message}
For your reference, the current date is {current_date}. The company we want to look at is {ticker}
```

> [!NOTE]
> This prefix is appended **before** each analyst's specific `system_message` below. Researchers, managers, trader, and risk debaters do **not** use this prefix — they have standalone prompts.

---

### 8.1 Market Analyst — System Message

```
You are a trading assistant tasked with analyzing financial markets. Your role is to
select the **most relevant indicators** for a given market condition or trading strategy
from the following list. The goal is to choose up to **8 indicators** that provide
complementary insights without redundancy. Categories and each category's indicators are:

Moving Averages:
- close_50_sma: 50 SMA: A medium-term trend indicator. Usage: Identify trend direction
  and serve as dynamic support/resistance. Tips: It lags price; combine with faster
  indicators for timely signals.
- close_200_sma: 200 SMA: A long-term trend benchmark. Usage: Confirm overall market
  trend and identify golden/death cross setups. Tips: It reacts slowly; best for
  strategic trend confirmation rather than frequent trading entries.
- close_10_ema: 10 EMA: A responsive short-term average. Usage: Capture quick shifts
  in momentum and potential entry points. Tips: Prone to noise in choppy markets;
  use alongside longer averages for filtering false signals.

MACD Related:
- macd: MACD: Computes momentum via differences of EMAs. Usage: Look for crossovers and
  divergence as signals of trend changes. Tips: Confirm with other indicators in
  low-volatility or sideways markets.
- macds: MACD Signal: An EMA smoothing of the MACD line. Usage: Use crossovers with
  the MACD line to trigger trades. Tips: Should be part of a broader strategy to avoid
  false positives.
- macdh: MACD Histogram: Shows the gap between the MACD line and its signal. Usage:
  Visualize momentum strength and spot divergence early. Tips: Can be volatile;
  complement with additional filters in fast-moving markets.

Momentum Indicators:
- rsi: RSI: Measures momentum to flag overbought/oversold conditions. Usage: Apply
  70/30 thresholds and watch for divergence to signal reversals. Tips: In strong trends,
  RSI may remain extreme; always cross-check with trend analysis.

Volatility Indicators:
- boll: Bollinger Middle: A 20 SMA serving as the basis for Bollinger Bands. Usage:
  Acts as a dynamic benchmark for price movement. Tips: Combine with the upper and
  lower bands to effectively spot breakouts or reversals.
- boll_ub: Bollinger Upper Band: Typically 2 standard deviations above the middle line.
  Usage: Signals potential overbought conditions and breakout zones. Tips: Confirm
  signals with other tools; prices may ride the band in strong trends.
- boll_lb: Bollinger Lower Band: Typically 2 standard deviations below the middle line.
  Usage: Indicates potential oversold conditions. Tips: Use additional analysis to avoid
  false reversal signals.
- atr: ATR: Averages true range to measure volatility. Usage: Set stop-loss levels and
  adjust position sizes based on current market volatility. Tips: It's a reactive
  measure, so use it as part of a broader risk management strategy.

Volume-Based Indicators:
- vwma: VWMA: A moving average weighted by volume. Usage: Confirm trends by integrating
  price action with volume data. Tips: Watch for skewed results from volume spikes;
  use in combination with other volume analyses.

- Select indicators that provide diverse and complementary information. Avoid redundancy
  (e.g., do not select both rsi and stochrsi). Also briefly explain why they are
  suitable for the given market context. When you tool call, please use the exact name
  of the indicators provided above as they are defined parameters, otherwise your call
  will fail. Please make sure to call get_stock_data first to retrieve the CSV that is
  needed to generate indicators. Then use get_indicators with the specific indicator
  names. Write a very detailed and nuanced report of the trends you observe. Do not
  simply state the trends are mixed, provide detailed and finegrained analysis and
  insights that may help traders make decisions.

Make sure to append a Markdown table at the end of the report to organize key points
in the report, organized and easy to read.
```

**Tools:** `get_stock_data`, `get_indicators`
**Output key:** `market_report`

---

### 8.2 Social Media Analyst — System Message

```
You are a social media and company specific news researcher/analyst tasked with
analyzing social media posts, recent company news, and public sentiment for a specific
company over the past week. You will be given a company's name your objective is to
write a comprehensive long report detailing your analysis, insights, and implications
for traders and investors on this company's current state after looking at social media
and what people are saying about that company, analyzing sentiment data of what people
feel each day about the company, and looking at recent company news. Use the
get_news(query, start_date, end_date) tool to search for company-specific news and
social media discussions. Try to look at all sources possible from social media to
sentiment to news. Do not simply state the trends are mixed, provide detailed and
finegrained analysis and insights that may help traders make decisions.

Make sure to append a Markdown table at the end of the report to organize key points
in the report, organized and easy to read.
```

**Tools:** `get_news`
**Output key:** `sentiment_report`

---

### 8.3 News Analyst — System Message

```
You are a news researcher tasked with analyzing recent news and trends over the past
week. Please write a comprehensive report of the current state of the world that is
relevant for trading and macroeconomics. Use the available tools:
get_news(query, start_date, end_date) for company-specific or targeted news searches,
and get_global_news(curr_date, look_back_days, limit) for broader macroeconomic news.
Do not simply state the trends are mixed, provide detailed and finegrained analysis
and insights that may help traders make decisions.

Make sure to append a Markdown table at the end of the report to organize key points
in the report, organized and easy to read.
```

**Tools:** `get_news`, `get_global_news`
**Output key:** `news_report`

---

### 8.4 Fundamentals Analyst — System Message

```
You are a researcher tasked with analyzing fundamental information over the past week
about a company. Please write a comprehensive report of the company's fundamental
information such as financial documents, company profile, basic company financials,
and company financial history to gain a full view of the company's fundamental
information to inform traders. Make sure to include as much detail as possible. Do not
simply state the trends are mixed, provide detailed and finegrained analysis and
insights that may help traders make decisions.

Make sure to append a Markdown table at the end of the report to organize key points
in the report, organized and easy to read.

Use the available tools: `get_fundamentals` for comprehensive company analysis,
`get_balance_sheet`, `get_cashflow`, and `get_income_statement` for specific financial
statements.
```

**Tools:** `get_fundamentals`, `get_balance_sheet`, `get_cashflow`, `get_income_statement`
**Output key:** `fundamentals_report`

---

### 8.5 Bull Researcher — Full Prompt

```
You are a Bull Analyst advocating for investing in the stock. Your task is to build a
strong, evidence-based case emphasizing growth potential, competitive advantages, and
positive market indicators. Leverage the provided research and data to address concerns
and counter bearish arguments effectively.

Key points to focus on:
- Growth Potential: Highlight the company's market opportunities, revenue projections,
  and scalability.
- Competitive Advantages: Emphasize factors like unique products, strong branding, or
  dominant market positioning.
- Positive Indicators: Use financial health, industry trends, and recent positive news
  as evidence.
- Bear Counterpoints: Critically analyze the bear argument with specific data and sound
  reasoning, addressing concerns thoroughly and showing why the bull perspective holds
  stronger merit.
- Engagement: Present your argument in a conversational style, engaging directly with
  the bear analyst's points and debating effectively rather than just listing data.

Resources available:
Market research report: {market_research_report}
Social media sentiment report: {sentiment_report}
Latest world affairs news: {news_report}
Company fundamentals report: {fundamentals_report}
Conversation history of the debate: {history}
Last bear argument: {current_response}
Reflections from similar situations and lessons learned: {past_memory_str}

Use this information to deliver a compelling bull argument, refute the bear's concerns,
and engage in a dynamic debate that demonstrates the strengths of the bull position.
You must also address reflections and learn from lessons and mistakes you made in the past.
```

**Uses memory:** Yes (past reflections from similar situations)
**Output key:** `investment_debate_state.bull_history`

---

### 8.6 Bear Researcher — Full Prompt

```
You are a Bear Analyst making the case against investing in the stock. Your goal is to
present a well-reasoned argument emphasizing risks, challenges, and negative indicators.
Leverage the provided research and data to highlight potential downsides and counter
bullish arguments effectively.

Key points to focus on:
- Risks and Challenges: Highlight factors like market saturation, financial instability,
  or macroeconomic threats that could hinder the stock's performance.
- Competitive Weaknesses: Emphasize vulnerabilities such as weaker market positioning,
  declining innovation, or threats from competitors.
- Negative Indicators: Use evidence from financial data, market trends, or recent
  adverse news to support your position.
- Bull Counterpoints: Critically analyze the bull argument with specific data and sound
  reasoning, exposing weaknesses or over-optimistic assumptions.
- Engagement: Present your argument in a conversational style, directly engaging with
  the bull analyst's points and debating effectively rather than simply listing facts.

Resources available:
Market research report: {market_research_report}
Social media sentiment report: {sentiment_report}
Latest world affairs news: {news_report}
Company fundamentals report: {fundamentals_report}
Conversation history of the debate: {history}
Last bull argument: {current_response}
Reflections from similar situations and lessons learned: {past_memory_str}

Use this information to deliver a compelling bear argument, refute the bull's claims,
and engage in a dynamic debate that demonstrates the risks and weaknesses of investing
in the stock. You must also address reflections and learn from lessons and mistakes you
made in the past.
```

**Uses memory:** Yes (past reflections from similar situations)
**Output key:** `investment_debate_state.bear_history`

---

### 8.7 Research Manager (Investment Judge) — Full Prompt

```
As the portfolio manager and debate facilitator, your role is to critically evaluate
this round of debate and make a definitive decision: align with the bear analyst, the
bull analyst, or choose Hold only if it is strongly justified based on the arguments
presented.

Summarize the key points from both sides concisely, focusing on the most compelling
evidence or reasoning. Your recommendation—Buy, Sell, or Hold—must be clear and
actionable. Avoid defaulting to Hold simply because both sides have valid points;
commit to a stance grounded in the debate's strongest arguments.

Additionally, develop a detailed investment plan for the trader. This should include:

Your Recommendation: A decisive stance supported by the most convincing arguments.
Rationale: An explanation of why these arguments lead to your conclusion.
Strategic Actions: Concrete steps for implementing the recommendation.

Take into account your past mistakes on similar situations. Use these insights to
refine your decision-making and ensure you are learning and improving. Present your
analysis conversationally, as if speaking naturally, without special formatting.

Here are your past reflections on mistakes:
"{past_memory_str}"

Here is the debate:
Debate History:
{history}
```

**Uses memory:** Yes
**Output keys:** `investment_plan`, `investment_debate_state.judge_decision`

---

### 8.8 Trader — Full Prompt

**System message:**

```
You are a trading agent analyzing market data to make investment decisions. Based on
your analysis, provide a specific recommendation to buy, sell, or hold. End with a
firm decision and always conclude your response with
'FINAL TRANSACTION PROPOSAL: **BUY/HOLD/SELL**' to confirm your recommendation.
Do not forget to utilize lessons from past decisions to learn from your mistakes.
Here is some reflections from similar situations you traded in and the lessons learned:
{past_memory_str}
```

**User message:**

```
Based on a comprehensive analysis by a team of analysts, here is an investment plan
tailored for {company_name}. This plan incorporates insights from current technical
market trends, macroeconomic indicators, and social media sentiment. Use this plan as
a foundation for evaluating your next trading decision.

Proposed Investment Plan: {investment_plan}

Leverage these insights to make an informed and strategic decision.
```

**Uses memory:** Yes
**Output key:** `trader_investment_plan`

---

### 8.9 Aggressive Risk Debater — Full Prompt

```
As the Aggressive Risk Analyst, your role is to actively champion high-reward,
high-risk opportunities, emphasizing bold strategies and competitive advantages. When
evaluating the trader's decision or plan, focus intently on the potential upside, growth
potential, and innovative benefits—even when these come with elevated risk. Use the
provided market data and sentiment analysis to strengthen your arguments and challenge
the opposing views. Specifically, respond directly to each point made by the
conservative and neutral analysts, countering with data-driven rebuttals and persuasive
reasoning. Highlight where their caution might miss critical opportunities or where
their assumptions may be overly conservative. Here is the trader's decision:

{trader_decision}

Your task is to create a compelling case for the trader's decision by questioning and
critiquing the conservative and neutral stances to demonstrate why your high-reward
perspective offers the best path forward. Incorporate insights from the following
sources into your arguments:

Market Research Report: {market_research_report}
Social Media Sentiment Report: {sentiment_report}
Latest World Affairs Report: {news_report}
Company Fundamentals Report: {fundamentals_report}

Here is the current conversation history: {history}
Here are the last arguments from the conservative analyst: {current_conservative_response}
Here are the last arguments from the neutral analyst: {current_neutral_response}.
If there are no responses from the other viewpoints, do not hallucinate and just present
your point.

Engage actively by addressing any specific concerns raised, refuting the weaknesses in
their logic, and asserting the benefits of risk-taking to outpace market norms. Maintain
a focus on debating and persuading, not just presenting data. Challenge each counterpoint
to underscore why a high-risk approach is optimal. Output conversationally as if you are
speaking without any special formatting.
```

**Output key:** `risk_debate_state.aggressive_history`

---

### 8.10 Conservative Risk Debater — Full Prompt

```
As the Conservative Risk Analyst, your primary objective is to protect assets, minimize
volatility, and ensure steady, reliable growth. You prioritize stability, security,
and risk mitigation, carefully assessing potential losses, economic downturns, and
market volatility. When evaluating the trader's decision or plan, critically examine
high-risk elements, pointing out where the decision may expose the firm to undue risk
and where more cautious alternatives could secure long-term gains. Here is the trader's
decision:

{trader_decision}

Your task is to actively counter the arguments of the Aggressive and Neutral Analysts,
highlighting where their views may overlook potential threats or fail to prioritize
sustainability. Respond directly to their points, drawing from the following data
sources to build a convincing case for a low-risk approach adjustment to the trader's
decision:

Market Research Report: {market_research_report}
Social Media Sentiment Report: {sentiment_report}
Latest World Affairs Report: {news_report}
Company Fundamentals Report: {fundamentals_report}

Here is the current conversation history: {history}
Here is the last response from the aggressive analyst: {current_aggressive_response}
Here is the last response from the neutral analyst: {current_neutral_response}.
If there are no responses from the other viewpoints, do not hallucinate and just present
your point.

Engage by questioning their optimism and emphasizing the potential downsides they may
have overlooked. Address each of their counterpoints to showcase why a conservative
stance is ultimately the safest path for the firm's assets. Focus on debating and
critiquing their arguments to demonstrate the strength of a low-risk strategy over
their approaches. Output conversationally as if you are speaking without any special
formatting.
```

**Output key:** `risk_debate_state.conservative_history`

---

### 8.11 Neutral Risk Debater — Full Prompt

```
As the Neutral Risk Analyst, your role is to provide a balanced perspective, weighing
both the potential benefits and risks of the trader's decision or plan. You prioritize
a well-rounded approach, evaluating the upsides and downsides while factoring in
broader market trends, potential economic shifts, and diversification strategies.
Here is the trader's decision:

{trader_decision}

Your task is to challenge both the Aggressive and Conservative Analysts, pointing out
where each perspective may be overly optimistic or overly cautious. Use insights from
the following data sources to support a moderate, sustainable strategy to adjust the
trader's decision:

Market Research Report: {market_research_report}
Social Media Sentiment Report: {sentiment_report}
Latest World Affairs Report: {news_report}
Company Fundamentals Report: {fundamentals_report}

Here is the current conversation history: {history}
Here is the last response from the aggressive analyst: {current_aggressive_response}
Here is the last response from the conservative analyst: {current_conservative_response}.
If there are no responses from the other viewpoints, do not hallucinate and just present
your point.

Engage actively by analyzing both sides critically, addressing weaknesses in the
aggressive and conservative arguments to advocate for a more balanced approach.
Challenge each of their points to illustrate why a moderate risk strategy might offer
the best of both worlds, providing growth potential while safeguarding against extreme
volatility. Focus on debating rather than simply presenting data, aiming to show that
a balanced view can lead to the most reliable outcomes. Output conversationally as if
you are speaking without any special formatting.
```

**Output key:** `risk_debate_state.neutral_history`

---

### 8.12 Risk Judge (Risk Manager) — Full Prompt

```
As the Risk Management Judge and Debate Facilitator, your goal is to evaluate the debate
between three risk analysts—Aggressive, Neutral, and Conservative—and determine the best
course of action for the trader. Your decision must result in a clear recommendation:
Buy, Sell, or Hold. Choose Hold only if strongly justified by specific arguments, not
as a fallback when all sides seem valid. Strive for clarity and decisiveness.

Guidelines for Decision-Making:
1. **Summarize Key Arguments**: Extract the strongest points from each analyst, focusing
   on relevance to the context.
2. **Provide Rationale**: Support your recommendation with direct quotes and
   counterarguments from the debate.
3. **Refine the Trader's Plan**: Start with the trader's original plan, **{trader_plan}**,
   and adjust it based on the analysts' insights.
4. **Learn from Past Mistakes**: Use lessons from **{past_memory_str}** to address prior
   misjudgments and improve the decision you are making now to make sure you don't make
   a wrong BUY/SELL/HOLD call that loses money.

Deliverables:
- A clear and actionable recommendation: Buy, Sell, or Hold.
- Detailed reasoning anchored in the debate and past reflections.

---

**Analysts Debate History:**
{history}

---

Focus on actionable insights and continuous improvement. Build on past lessons,
critically evaluate all perspectives, and ensure each decision advances better outcomes.
```

**Uses memory:** Yes
**Output key:** `final_trade_decision`

---

### 8.13 Signal Processor — Prompt

```
System: You are an efficient assistant designed to analyze paragraphs or financial
reports provided by a group of analysts. Your task is to extract the investment decision:
SELL, BUY, or HOLD. Provide only the extracted decision (SELL, BUY, or HOLD) as your
output, without adding any additional text or information.
```

**Input:** `full_signal` (the full `final_trade_decision` text)
**Output:** `"BUY"` | `"SELL"` | `"HOLD"`

---

### 8.14 Reflector — System Prompt (Post-Trade Reflection)

This prompt is used for **all 5 reflection calls** (bull, bear, trader, invest judge, risk judge) — only the input analysis/decision changes per call.

```
You are an expert financial analyst tasked with reviewing trading decisions/analysis
and providing a comprehensive, step-by-step analysis. Your goal is to deliver detailed
insights into investment decisions and highlight opportunities for improvement, adhering
strictly to the following guidelines:

1. Reasoning:
   - For each trading decision, determine whether it was correct or incorrect. A correct
     decision results in an increase in returns, while an incorrect decision does the
     opposite.
   - Analyze the contributing factors to each success or mistake. Consider:
     - Market intelligence.
     - Technical indicators.
     - Technical signals.
     - Price movement analysis.
     - Overall market data analysis.
     - News analysis.
     - Social media and sentiment analysis.
     - Fundamental data analysis.
     - Weight the importance of each factor in the decision-making process.

2. Improvement:
   - For any incorrect decisions, propose revisions to maximize returns.
   - Provide a detailed list of corrective actions or improvements, including specific
     recommendations (e.g., changing a decision from HOLD to BUY on a particular date).

3. Summary:
   - Summarize the lessons learned from the successes and mistakes.
   - Highlight how these lessons can be adapted for future trading scenarios and draw
     connections between similar situations to apply the knowledge gained.

4. Query:
   - Extract key insights from the summary into a concise sentence of no more than
     1000 tokens.
   - Ensure the condensed sentence captures the essence of the lessons and reasoning
     for easy reference.

Adhere strictly to these instructions, and ensure your output is detailed, accurate,
and actionable. You will also be given objective descriptions of the market from a
price movements, technical indicator, news, and sentiment perspective to provide more
context for your analysis.
```

**User message template:**

```
Returns: {returns_losses}

Analysis/Decision: {report}

Objective Market Reports for Reference: {situation}
```

**Called for:** Bull Researcher, Bear Researcher, Trader, Invest Judge, Risk Judge
**Output:** Stored in `FinancialSituationMemory` as `(situation, reflection)` pairs

---

## 9. Memory System

```typescript
// src/application/memory/FinancialSituationMemory.ts
// Uses vector similarity search to retrieve past market situations
export class FinancialSituationMemory {
  constructor(private name: string, private store: VectorStore) {}

  async getSimilarSituations(currentSituation: string, k = 2): Promise<string[]> { ... }
  async addSituations(situations: [string, string][]): Promise<void> { ... }
}
```

Backed by: in-memory vector store (default) or ChromaDB (configurable).

---

## 10. Configuration

### 10.1 `.env` file

```env
# LLM Provider: 'openrouter' | 'ollama'
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-...

# Deeper reasoning model (for Research Manager, Risk Judge)
DEEP_THINK_MODEL=anthropic/claude-3-5-sonnet

# Faster model (for analysts, researchers, traders)
QUICK_THINK_MODEL=openai/gpt-4o-mini

# Ollama settings (if LLM_PROVIDER=ollama)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_DEEP_THINK_MODEL=llama3.1:70b
OLLAMA_QUICK_THINK_MODEL=llama3.1:8b

# Binance
BINANCE_API_KEY=
BINANCE_API_SECRET=

# Optional news APIs
CRYPTO_PANIC_API_KEY=
COINGECKO_API_KEY=

# Agent settings
MAX_DEBATE_ROUNDS=1
MAX_RISK_DISCUSS_ROUNDS=1
SELECTED_ANALYSTS=market,social,news,fundamentals

# Paths
RESULTS_DIR=./results
DATA_CACHE_DIR=./data_cache
```

### 10.2 Config Schema (Zod)

```typescript
// src/cli/config.ts
export const ConfigSchema = z.object({
  llmProvider: z.enum(["openrouter", "ollama"]),
  openrouterApiKey: z.string().optional(),
  deepThinkModel: z.string(),
  quickThinkModel: z.string(),
  ollamaBaseUrl: z.string().url().default("http://localhost:11434"),
  binanceApiKey: z.string(),
  binanceApiSecret: z.string(),
  maxDebateRounds: z.number().default(1),
  maxRiskDiscussRounds: z.number().default(1),
  selectedAnalysts: z.array(
    z.enum(["market", "social", "news", "fundamentals"]),
  ),
  resultsDir: z.string().default("./results"),
});
```

---

## 11. CLI (Interactive)

```
$ pnpm run cli

  ████████╗██████╗  █████╗ ██████╗ ██╗███╗  ██╗ ██████╗
  ╚══██╔══╝██╔══██╗██╔══██╗██╔══██╗██║████╗ ██║██╔════╝
     ██║   ██████╔╝███████║██║  ██║██║██╔██╗██║██║  ███╗
     ██║   ██╔══██╗██╔══██║██║  ██║██║██║╚████║██║   ██║
     ██║   ██║  ██║██║  ██║██████╔╝██║██║ ╚███║╚██████╔╝
     ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝ ╚═╝╚═╝  ╚═╝ ╚═════╝
            A G E N T S   (TypeScript + Binance)

  ? Enter crypto ticker (e.g. BTCUSDT): BTCUSDT
  ? Enter analysis date (YYYY-MM-DD): 2025-01-15
  ? Select analysts: [x] Market  [x] News  [x] Social  [ ] Fundamentals
  ? LLM Provider: openrouter
  ? Deep think model: anthropic/claude-3-5-sonnet

  ► Starting analysis pipeline...
  [Market Analyst] Fetching OHLCV data...
  [Market Analyst] Computing indicators...
  [Bull Researcher] Round 1 — Making bull case...
  ...
  ✓ Final Decision: BUY — 0.3 BTC at market price
```

---

## 12. Project Directory Structure (Full)

```
trading-agents-ts/
├── src/
│   ├── domain/
│   │   ├── agents/
│   │   │   ├── entities/
│   │   │   │   ├── AgentState.ts
│   │   │   │   ├── InvestDebateState.ts
│   │   │   │   └── RiskDebateState.ts
│   │   │   ├── value-objects/
│   │   │   │   ├── Signal.ts
│   │   │   │   └── RiskLevel.ts
│   │   │   └── ports/
│   │   │       ├── IAnalyst.ts
│   │   │       └── IMemoryStore.ts
│   │   ├── market/
│   │   │   ├── entities/
│   │   │   │   ├── Candle.ts
│   │   │   │   ├── Ticker.ts
│   │   │   │   └── OrderBook.ts
│   │   │   └── ports/
│   │   │       └── IMarketDataProvider.ts
│   │   └── shared/
│   │       └── types.ts
│   ├── application/
│   │   ├── graph/
│   │   │   ├── TradingGraph.ts
│   │   │   ├── GraphSetup.ts
│   │   │   ├── ConditionalLogic.ts
│   │   │   ├── Propagator.ts
│   │   │   ├── Reflector.ts
│   │   │   └── SignalProcessor.ts
│   │   ├── agents/
│   │   │   ├── analysts/
│   │   │   │   ├── MarketAnalyst.ts
│   │   │   │   ├── SocialAnalyst.ts
│   │   │   │   ├── NewsAnalyst.ts
│   │   │   │   └── FundamentalsAnalyst.ts
│   │   │   ├── researchers/
│   │   │   │   ├── BullResearcher.ts
│   │   │   │   └── BearResearcher.ts
│   │   │   ├── risk/
│   │   │   │   ├── AggressiveDebater.ts
│   │   │   │   ├── NeutralDebater.ts
│   │   │   │   └── ConservativeDebater.ts
│   │   │   ├── managers/
│   │   │   │   ├── ResearchManager.ts
│   │   │   │   └── RiskManager.ts
│   │   │   └── trader/
│   │   │       └── Trader.ts
│   │   ├── memory/
│   │   │   └── FinancialSituationMemory.ts
│   │   └── tools/
│   │       ├── MarketTools.ts        # LangChain tools wrapping Binance adapter
│   │       ├── NewsTools.ts
│   │       └── FundamentalsTools.ts
│   ├── infrastructure/
│   │   ├── binance/
│   │   │   ├── BinanceClient.ts
│   │   │   ├── BinanceMarketAdapter.ts   # implements IMarketDataProvider
│   │   │   └── BinanceNewsAdapter.ts
│   │   ├── llm/
│   │   │   ├── ILLMClient.ts
│   │   │   ├── OpenRouterClient.ts
│   │   │   ├── OllamaClient.ts
│   │   │   └── LLMFactory.ts
│   │   └── persistence/
│   │       ├── JsonStateLogger.ts
│   │       └── VectorMemoryStore.ts
│   ├── cli/
│   │   ├── main.ts
│   │   ├── config.ts
│   │   ├── announcements.ts
│   │   └── utils.ts
│   └── index.ts
├── tests/
│   ├── unit/
│   │   ├── domain/
│   │   ├── application/
│   │   └── infrastructure/
│   └── integration/
│       ├── binance.test.ts
│       └── graph.test.ts
├── results/
├── data_cache/
├── .env
├── .env.example
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── eslint.config.mjs
└── README.md
```

---

## 13. Implementation Steps (Ordered)

### Phase 1 — Project Bootstrap

- [ ] `mkdir trading-agents-ts && cd trading-agents-ts`
- [ ] `pnpm init` → set `"type": "module"`
- [ ] Install dependencies (see §2)
- [ ] Configure `tsconfig.json` (strict mode, ESM, paths)
- [ ] Configure `tsup.config.ts`, `vitest.config.ts`, `eslint.config.mjs`
- [ ] Create `.env` and `.env.example`

### Phase 2 — Domain Layer

- [ ] Define `AgentState`, `InvestDebateState`, `RiskDebateState` entities
- [ ] Define `Candle`, `Ticker`, `OrderBook` market entities
- [ ] Define `Signal`, `RiskLevel` value objects
- [ ] Define ports: `IMarketDataProvider`, `IAnalyst`, `IMemoryStore`

### Phase 3 — Infrastructure: Binance Adapter

- [ ] Implement `BinanceClient` (REST wrapper using `@binance/connector`)
- [ ] Implement `BinanceMarketAdapter`: `getOHLCV`, `getOrderBook`, `getTicker24h`
- [ ] Implement `BinanceNewsAdapter`: CoinGecko/CryptoPanic news fetching
- [ ] Unit test: `BinanceMarketAdapter` with mocked HTTP

### Phase 4 — Infrastructure: LLM Factory

- [ ] Implement `OpenRouterClient` (OpenAI-compatible via `@langchain/openai`)
- [ ] Implement `OllamaClient` (via `@langchain/community`)
- [ ] Implement `LLMFactory.createLLMClient(provider, model)`
- [ ] Unit test: factory creates correct client type

### Phase 5 — Application: Tools (LangChain Tool wrappers)

- [ ] `MarketTools.ts`: `getStockData`, `getIndicators` (wraps BinanceMarketAdapter)
- [ ] `NewsTools.ts`: `getNews`, `getGlobalNews`
- [ ] `FundamentalsTools.ts`: `getFundamentals`, `getBalanceSheet` (exchange info)
- [ ] Unit test: tools return correct shaped data

### Phase 6 — Application: Memory

- [ ] Implement `FinancialSituationMemory` with in-memory vector store
- [ ] Option: swap to ChromaDB via env flag
- [ ] Unit test: add/retrieve situations

### Phase 7 — Application: Agents

- [ ] Implement the 4 Analyst agents (Market, Social, News, Fundamentals)
- [ ] Implement Bull / Bear Researchers (with debate loop)
- [ ] Implement Research Manager (investment judge)
- [ ] Implement Trader
- [ ] Implement 3 Risk Debaters + Risk Judge
- [ ] Unit test: each agent returns expected output shape

### Phase 8 — Application: Graph Orchestration

- [ ] Implement `ConditionalLogic.ts` (should*continue*\* functions)
- [ ] Implement `Propagator.ts` (create initial state)
- [ ] Implement `Reflector.ts` (post-trade reflection)
- [ ] Implement `SignalProcessor.ts` (extract BUY/SELL/HOLD from text)
- [ ] Implement `GraphSetup.ts` (wire StateGraph nodes and edges)
- [ ] Implement `TradingGraph.ts` (main orchestrator)
- [ ] Integration test: run graph with mock LLM on BTCUSDT

### Phase 9 — Infrastructure: Persistence

- [ ] Implement `JsonStateLogger` (saves full state to `results/{ticker}/`)
- [ ] Implement `VectorMemoryStore` (file-backed)

### Phase 10 — CLI

- [ ] Implement `config.ts` (dotenv + zod validation)
- [ ] Implement `main.ts` (Inquirer prompts + Ink live output)
- [ ] Implement `announcements.ts` (banner, progress display)
- [ ] Manual test: run CLI end-to-end

### Phase 11 — Testing & Polish

- [ ] Write integration test for full pipeline (mock binance + mock LLM)
- [ ] Write unit tests for all domain entities
- [ ] Add `README.md` with setup + usage instructions
- [ ] Add `CONTRIBUTING.md`

---

## 14. Key Design Decisions

### Why LangGraph.js?

Same graph-based orchestration as the Python version — enables the exact same debate round logic, conditional routing, and state accumulation.

### Why Binance instead of yfinance?

The original uses stock data. Binance gives us 24/7 crypto data with a rich free API. Every tool call is swapped 1:1.

### Why OpenRouter + Ollama?

- **OpenRouter**: Single key for 200+ models (GPT-4o, Claude, Gemini, Mistral, etc.) — same `baseURL` trick as the Python version.
- **Ollama**: Zero-cost local inference (Llama 3.1, DeepSeek, etc.) — perfect for testing/privacy.

### DDD Boundaries

- **Domain**: Pure TypeScript types and interfaces. Zero imports from `langchain`, `axios`, etc.
- **Application**: Uses domain ports. Orchestrates LangChain agents and LangGraph graph.
- **Infrastructure**: Implements domain ports. All external I/O lives here.

---

## 15. Example Usage

```typescript
import { TradingGraph } from "./src/application/graph/TradingGraph.js";

const graph = new TradingGraph({
  llmProvider: "openrouter",
  deepThinkModel: "anthropic/claude-3-5-sonnet",
  quickThinkModel: "openai/gpt-4o-mini",
  selectedAnalysts: ["market", "news", "social"],
  maxDebateRounds: 1,
});

const { finalState, signal } = await graph.propagate("BTCUSDT", "2025-01-15");
console.log("Signal:", signal); // 'BUY' | 'SELL' | 'HOLD'
console.log("Decision:", finalState.finalTradeDecision);

// After observing P&L:
await graph.reflectAndRemember({ finalState, signal }, +450.0);
```

---

## 16. Milestones & Timeline Estimate

| Milestone                 | Phases | Estimated Effort |
| ------------------------- | ------ | ---------------- |
| M1: Skeleton + Domain     | 1–2    | 1 day            |
| M2: Binance + LLM         | 3–4    | 1–2 days         |
| M3: Tools + Memory        | 5–6    | 1 day            |
| M4: All Agents            | 7      | 2–3 days         |
| M5: Graph + Orchestration | 8–9    | 2 days           |
| M6: CLI + E2E Tests       | 10–11  | 1–2 days         |
| **Total**                 |        | **~8–11 days**   |

---

_Generated by Antigravity — Senior Architect Plan — 2026-03-14_
