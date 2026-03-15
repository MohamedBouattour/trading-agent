# 🚀 TradingAgents TS Roadmap

This roadmap outlines the technical evolution of the TypeScript version of the `TradingAgents` project. The goal is to achieve feature parity with the original Python implementation while maintaining a clean, hexagonal architecture and high type safety.

---

## 🏗️ Phase 1: Architectural Refinement & Type Safety (Short-term)
*Current status: Foundation laid, but requires refinement.*

- [ ] **State Sanitization**: Replace `any[]` in `AgentState.ts` with explicit LangChain `BaseMessage` types.
- [ ] **Domain Entity Completion**: Finalize `Candle`, `Ticker`, and `OrderBook` entities to ensure they fully support Binance data structures.
- [ ] **DI (Dependency Injection)**: Consider a lightweight DI container (e.g., `tsyringe`) or a more explicit factory pattern to manage the growing number of services.
- [ ] **Error Handling**: Implement a global error handling strategy across the graph nodes to prevent "hanging" executions.

## 📊 Phase 2: Infrastructure & Tools Completion (Short-term)
*Current status: Binance adapter started, news tools are placeholders.*

- [ ] **Binance Adapter**: Complete technical indicator calculations (RSI, MACD, etc.) using `technicalindicators` library.
- [ ] **News Integration**: 
    - [ ] Implement `BinanceNewsAdapter` using CryptoPanic or CoinGecko APIs.
    - [ ] Implement `SocialAnalyst` tool to fetch sentiment from Reddit/X (Twitter) if feasible, or use a sentiment API.
- [ ] **Fundamentals Tool**: Map Binance `exchangeInfo` and other endpoints to provide a comprehensive "Fundamentals" report for crypto.

## 🧠 Phase 3: Agent & Logic Implementation (Mid-term)
*Current status: Agent implementations are basic; prompt logic needs porting.*

- [ ] **Prompt Engineering**: Systematically port all 14+ specific prompts from `plan.md` into the agent implementations.
- [ ] **Debate Logic**: 
    - [ ] Refine `ConditionalLogic.ts` to support multi-round debates for Bull/Bear researchers.
    - [ ] Implement the Risk Management debate loop (Aggressive/Neutral/Conservative).
- [ ] **Memory System**:
    - [ ] Implement the `FinancialSituationMemory` using a real vector store (ChromaDB or a local FAISS-like store).
    - [ ] Implement the "Reflector" node to store post-trade analysis back into the vector store.

## 🖥️ Phase 4: CLI & UX (Mid-term)
*Current status: CLI entry point is missing or basic.*

- [ ] **Interactive CLI**: Build a rich CLI using `Ink` or `Inquirer` that allows:
    - [ ] Ticker and date selection.
    - [ ] Analyst selection.
    - [ ] Live progress visualization of the agent graph.
    - [ ] Results summary with BUY/SELL/HOLD signal.
- [ ] **Result Persistence**: Implement `JsonStateLogger` to save every run's full state for evaluation and debugging.

## 🧪 Phase 5: Testing & Validation (Long-term)
*Current status: Basic Vitest config present.*

- [ ] **Unit Tests**: Coverage for domain logic, signal processing, and adapter mapping.
- [ ] **Integration Tests**: End-to-end "Dry Run" test using mock LLM responses and cached Binance data.
- [ ] **Backtesting**: Create a simple backtesting script that runs the graph over historical dates and calculates P&L.

---

## 🌟 Future Vision (Next Gen)
- **Real-time Monitoring**: A web dashboard (React/Next.js) to visualize the agent debates in real-time.
- **Auto-Execution**: Integration with Binance Futures/Spot API to execute trades automatically based on the final decision (with strict safety limits).
- **Multi-Chain Support**: Adding adapters for DEXs (Uniswap, Raydium) and on-chain data.

---
*Roadmap generated on 2026-03-14 by Senior Architect.*
