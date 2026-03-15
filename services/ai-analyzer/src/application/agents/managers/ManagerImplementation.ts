import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AgentState } from "../../../domain/agents/entities/AgentState.js";
import { SystemMessage } from "@langchain/core/messages";

// §8.7 Research Manager (Investment Judge)
const RESEARCH_MANAGER_PROMPT_TEMPLATE = (
  history: string,
  pastMemory: string,
) => `As the portfolio manager and debate facilitator, your role is to critically evaluate this round of debate and make a definitive decision: align with the bear analyst, the bull analyst, or choose Hold only if it is strongly justified based on the arguments presented.

Summarize the key points from both sides concisely, focusing on the most compelling evidence or reasoning. Your recommendation—Buy, Sell, or Hold—must be clear and actionable. Avoid defaulting to Hold simply because both sides have valid points; commit to a stance grounded in the debate's strongest arguments.

Additionally, develop a detailed investment plan for the trader. This should include:

Your Recommendation: A decisive stance supported by the most convincing arguments.
Rationale: An explanation of why these arguments lead to your conclusion.
Strategic Actions: Concrete steps for implementing the recommendation.

Take into account your past mistakes on similar situations. Use these insights to refine your decision-making and ensure you are learning and improving. Present your analysis conversationally, as if speaking naturally, without special formatting.

Here are your past reflections on mistakes:
"${pastMemory}"

Here is the debate:
Debate History:
${history}`;

// §8.8 Trader
const TRADER_SYSTEM_PROMPT = (
  pastMemory: string,
) => `You are a trading agent analyzing market data to make investment decisions. Based on your analysis, provide a specific recommendation to buy, sell, or hold. End with a firm decision and always conclude your response with 'FINAL TRANSACTION PROPOSAL: **BUY/HOLD/SELL**' to confirm your recommendation.
Do not forget to utilize lessons from past decisions to learn from your mistakes.
Here is some reflections from similar situations you traded in and the lessons learned:
${pastMemory}`;

const TRADER_USER_PROMPT = (
  companyName: string,
  investmentPlan: string,
) => `Based on a comprehensive analysis by a team of analysts, here is an investment plan tailored for ${companyName}. This plan incorporates insights from current technical market trends, macroeconomic indicators, and social media sentiment. Use this plan as a foundation for evaluating your next trading decision.

Proposed Investment Plan: ${investmentPlan}

Leverage these insights to make an informed and strategic decision.`;

export const createDecisionMakers = (model: BaseChatModel) => {
  const researchManager = async (state: AgentState) => {
    const history =
      state.investmentDebateState.bullHistory.join("\n") +
      "\n" +
      state.investmentDebateState.bearHistory.join("\n");
    const pastMemory = ""; // Populated from memory store in application layer

    const prompt = RESEARCH_MANAGER_PROMPT_TEMPLATE(history, pastMemory);
    const response = await model.invoke([new HumanMessage(prompt)]);

    // We need to extract the decision (BUY/SELL/HOLD).
    // Usually this is done via SignalProcessor later, but we store the full plan here.
    return {
      investmentPlan: response.content as string,
    };
  };

  const trader = async (state: AgentState) => {
    const pastMemory = "";
    const systemPrompt = TRADER_SYSTEM_PROMPT(pastMemory);
    const userPrompt = TRADER_USER_PROMPT(state.ticker, state.investmentPlan);

    const response = await model.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt),
    ]);

    return {
      traderInvestmentPlan: response.content as string,
    };
  };

  return { researchManager, trader };
};

import { HumanMessage } from "@langchain/core/messages";
