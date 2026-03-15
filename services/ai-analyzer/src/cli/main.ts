import { TradingGraph } from "../application/graph/TradingGraph.js";
import { loadConfig, Config } from "./config.js";
import { JsonStateLogger } from "../infrastructure/persistence/JsonStateLogger.js";
import { LLMFactory } from "../infrastructure/llm/LLMFactory.js";
import inquirer from "inquirer";
import cliProgress from "cli-progress";
import ora from "ora";

const BANNER = `
  ████████╗██████╗  █████╗ ██████╗ ██╗███╗  ██╗ ██████╗
  ╚══██╔══╝██╔══██╗██╔══██╗██╔══██╗██║████╗ ██║██╔════╝
     ██║   ██████╔╝███████║██║  ██║██║██╔██╗██║██║  ███╗
     ██║   ██╔══██╗██╔══██║██║  ██║██║██║╚████║██║   ██║
     ██║   ██║  ██║██║  ██║██████╔╝██║██║ ╚███║╚██████╔╝
     ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝ ╚═╝╚═╝  ╚═╝ ╚═════╝
            A G E N T S   (TypeScript + Binance)
`;

// Helper to count approximate tokens (4 chars/token)
function countTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Helper to determine which task just completed based on state differences
function detectLastCompletedTask(oldState: any, newState: any): string {
  if (!oldState) return "Initialized Pipeline";

  if (newState.marketReport && newState.marketReport !== oldState.marketReport)
    return "Market Analyst";
  if (
    newState.sentimentReport &&
    newState.sentimentReport !== oldState.sentimentReport
  )
    return "Social Analyst";
  if (newState.newsReport && newState.newsReport !== oldState.newsReport)
    return "News Analyst";
  if (
    newState.fundamentalsReport &&
    newState.fundamentalsReport !== oldState.fundamentalsReport
  )
    return "Fundamentals Analyst";

  const oldBull = oldState.investmentDebateState?.bullHistory?.length || 0;
  const newBull = newState.investmentDebateState?.bullHistory?.length || 0;
  if (newBull > oldBull) return "Bull Researcher";

  const oldBear = oldState.investmentDebateState?.bearHistory?.length || 0;
  const newBear = newState.investmentDebateState?.bearHistory?.length || 0;
  if (newBear > oldBear) return "Bear Researcher";

  if (
    newState.investmentPlan &&
    newState.investmentPlan !== oldState.investmentPlan
  )
    return "Research Manager";

  if (
    newState.traderInvestmentPlan &&
    newState.traderInvestmentPlan !== oldState.traderInvestmentPlan
  )
    return "Trader";

  const oldAggressive =
    oldState.riskDebateState?.aggressiveHistory?.length || 0;
  const newAggressive =
    newState.riskDebateState?.aggressiveHistory?.length || 0;
  if (newAggressive > oldAggressive) return "Aggressive Risk Analyst";

  const oldConservative =
    oldState.riskDebateState?.conservativeHistory?.length || 0;
  const newConservative =
    newState.riskDebateState?.conservativeHistory?.length || 0;
  if (newConservative > oldConservative) return "Conservative Risk Analyst";

  const oldNeutral = oldState.riskDebateState?.neutralHistory?.length || 0;
  const newNeutral = newState.riskDebateState?.neutralHistory?.length || 0;
  if (newNeutral > oldNeutral) return "Neutral Risk Analyst";

  if (
    newState.finalTradeDecision &&
    newState.finalTradeDecision !== oldState.finalTradeDecision
  )
    return "Risk Manager";

  return "Routing...";
}

async function main() {
  console.log(BANNER);

  try {
    const config = loadConfig();
    const llmClient = LLMFactory.createLLMClient(
      config.llmProvider,
      config.openrouterApiKey,
      config.rateLimitDelayMs,
      config.googleApiKey,
    );

    const spinner = ora(
      `► Fetching available free models from ${config.llmProvider}...`,
    ).start();
    const allModels = await llmClient.getModels();
    const freeModels = allModels
      .filter((m) => m.id.endsWith(":free") || m.id.startsWith("gemini"))
      .map((m) => ({ name: m.name || m.id, value: m.id }));
    spinner.stop();

    if (freeModels.length === 0) {
      console.warn("⚠ No free models found. Using defaults.");
      freeModels.push({
        name: "Google Gemini 2.0 Flash Lite (Free)",
        value: "google/gemini-2.0-flash-lite-preview-02-05:free",
      });
    }

    const defaultFreeModel =
      freeModels.find((m) => m.value.includes(config.quickThinkModel))?.value ||
      freeModels[0]?.value ||
      config.quickThinkModel;

    const answers = await inquirer.prompt([
      {
        type: "list",
        name: "quickModel",
        message: "Select QUICK THINK model (for analysts/researchers):",
        choices: freeModels,
        default: defaultFreeModel,
      },
      {
        type: "list",
        name: "deepModel",
        message: "Select DEEP THINK model (for managers/judges):",
        choices: freeModels,
        default: defaultFreeModel,
      },
      {
        type: "input",
        name: "ticker",
        message: "Enter crypto ticker (e.g. BTCUSDT):",
        default: "BTCUSDT",
      },
      {
        type: "input",
        name: "date",
        message: "Enter analysis date (YYYY-MM-DD):",
        default: new Date().toISOString().split("T")[0],
      },
    ]);

    const finalConfig: Config = {
      ...config,
      quickThinkModel: answers.quickModel,
      deepThinkModel: answers.deepModel,
      embeddingModel: answers.quickModel,
    };

    console.log(`\n► Initializing Trading Graph pipeline...`);

    const graph = new TradingGraph(finalConfig);
    const progressBar = new cliProgress.SingleBar({
      format:
        "► Progress | {bar} | {percentage}% | {step} | {task} | Speed: {speed} t/s",
      barCompleteChar: "\u2588",
      barIncompleteChar: "\u2591",
      hideCursor: true,
    });

    // We estimate ~15 steps in the graph
    progressBar.start(100, 0, {
      step: "Initializing",
      task: "Starting".padEnd(25),
      speed: "0.0",
    });

    let lastState: any = null;
    let startTime = Date.now();
    let totalTokens = 0;
    let stepCount = 0;
    const totalSteps = 15; // Estimated nodes in GraphSetup

    for await (const state of graph.runStream(answers.ticker, answers.date)) {
      const taskName = detectLastCompletedTask(lastState, state);
      lastState = state;
      stepCount++;

      const currentTime = Date.now();
      const elapsedSec = (currentTime - startTime) / 1000;

      // Calculate delta tokens from latest reports
      let currentTokens = 0;
      if (state.marketReport) currentTokens += countTokens(state.marketReport);
      if (state.sentimentReport)
        currentTokens += countTokens(state.sentimentReport);
      if (state.newsReport) currentTokens += countTokens(state.newsReport);
      if (state.fundamentalsReport)
        currentTokens += countTokens(state.fundamentalsReport);
      if (state.investmentPlan)
        currentTokens += countTokens(state.investmentPlan);
      if (state.finalTradeDecision)
        currentTokens += countTokens(state.finalTradeDecision);

      const speed =
        elapsedSec > 0 ? (currentTokens / elapsedSec).toFixed(1) : "0.0";

      const progressPercent = Math.min(
        Math.floor((stepCount / totalSteps) * 100),
        99,
      );

      progressBar.update(progressPercent, {
        step: `Node ${stepCount}/${totalSteps}`,
        task: taskName.padEnd(25),
        speed: speed,
      });
    }

    progressBar.update(100, {
      step: "Complete",
      task: "Finished".padEnd(25),
      speed: "Finished",
    });
    progressBar.stop();

    // Extract final signal
    const signal = await graph.getSignal(lastState.finalTradeDecision);

    console.log(`\n✓ Analysis Complete!`);
    console.log(`------------------------------`);
    console.log(`Final Decision: ${signal}`);
    console.log(`Reasoning: ${lastState.finalTradeDecision.slice(0, 500)}...`);
    console.log(`------------------------------`);

    const logger = new JsonStateLogger(config.resultsDir);
    const logPath = await logger.logState(
      answers.ticker,
      answers.date,
      lastState,
    );
    console.log(`\nFull state saved to: ${logPath}`);
  } catch (err: any) {
    console.error("\n✖ Error:", err.message);
    process.exit(1);
  }
}

main();
