import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AgentState } from "../../../domain/agents/entities/AgentState.js";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

// §8.5 Bull Researcher
const BULL_PROMPT_TEMPLATE = (
  reports: any,
  history: string,
  currentResponse: string,
  pastMemory: string,
) => `You are a Bull Analyst advocating for investing in the stock. Your task is to build a strong, evidence-based case emphasizing growth potential, competitive advantages, and positive market indicators. Leverage the provided research and data to address concerns and counter bearish arguments effectively.

Key points to focus on:
- Growth Potential: Highlight the company's market opportunities, revenue projections, and scalability.
- Competitive Advantages: Emphasize factors like unique products, strong branding, or dominant market positioning.
- Positive Indicators: Use financial health, industry trends, and recent positive news as evidence.
- Bear Counterpoints: Critically analyze the bear argument with specific data and sound reasoning, addressing concerns thoroughly and showing why the bull perspective holds stronger merit.
- Engagement: Present your argument in a conversational style, engaging directly with the bear analyst's points and debating effectively rather than just listing data.

Resources available:
Market research report: ${reports.market}
Social media sentiment report: ${reports.sentiment}
Latest world affairs news: ${reports.news}
Company fundamentals report: ${reports.fundamentals}
Conversation history of the debate: ${history}
Last bear argument: ${currentResponse}
Reflections from similar situations and lessons learned: ${pastMemory}

Use this information to deliver a compelling bull argument, refute the bear's concerns, and engage in a dynamic debate that demonstrates the strengths of the bull position. You must also address reflections and learn from lessons and mistakes you made in the past.`;

// §8.6 Bear Researcher
const BEAR_PROMPT_TEMPLATE = (
  reports: any,
  history: string,
  currentResponse: string,
  pastMemory: string,
) => `You are a Bear Analyst making the case against investing in the stock. Your goal is to present a well-reasoned argument emphasizing risks, challenges, and negative indicators. Leverage the provided research and data to highlight potential downsides and counter bullish arguments effectively.

Key points to focus on:
- Risks and Challenges: Highlight factors like market saturation, financial instability, or macroeconomic threats that could hinder the stock's performance.
- Competitive Weaknesses: Emphasize vulnerabilities such as weaker market positioning, declining innovation, or threats from competitors.
- Negative Indicators: Use evidence from financial data, market trends, or recent adverse news to support your position.
- Bull Counterpoints: Critically analyze the bull argument with specific data and sound reasoning, exposing weaknesses or over-optimistic assumptions.
- Engagement: Present your argument in a conversational style, directly engaging with the bull analyst's points and debating effectively rather than simply listing facts.

Resources available:
Market research report: ${reports.market}
Social media sentiment report: ${reports.sentiment}
Latest world affairs news: ${reports.news}
Company fundamentals report: ${reports.fundamentals}
Conversation history of the debate: ${history}
Last bull argument: ${currentResponse}
Reflections from similar situations and lessons learned: ${pastMemory}

Use this information to deliver a compelling bear argument, refute the bull's claims, and engage in a dynamic debate that demonstrates the risks and weaknesses of investing in the stock. You must also address reflections and learn from lessons and mistakes you made in the past.`;

export const createResearchers = (model: BaseChatModel) => {
  const bullResearcher = async (state: AgentState) => {
    const reports = {
      market: state.marketReport,
      sentiment: state.sentimentReport,
      news: state.newsReport,
      fundamentals: state.fundamentalsReport,
    };
    const history =
      state.investmentDebateState.bullHistory.join("\n") +
      "\n" +
      state.investmentDebateState.bearHistory.join("\n");
    const currentResponse =
      state.investmentDebateState.bearHistory[
        state.investmentDebateState.bearHistory.length - 1
      ] || "No bear argument yet.";
    const pastMemory = ""; // Will be populated from memory store in application layer if needed

    const prompt = BULL_PROMPT_TEMPLATE(
      reports,
      history,
      currentResponse,
      pastMemory,
    );
    const response = await model.invoke([new HumanMessage(prompt)]);

    return {
      investmentDebateState: {
        ...state.investmentDebateState,
        bullHistory: [
          ...state.investmentDebateState.bullHistory,
          response.content as string,
        ],
      },
    };
  };

  const bearResearcher = async (state: AgentState) => {
    const reports = {
      market: state.marketReport,
      sentiment: state.sentimentReport,
      news: state.newsReport,
      fundamentals: state.fundamentalsReport,
    };
    const history =
      state.investmentDebateState.bullHistory.join("\n") +
      "\n" +
      state.investmentDebateState.bearHistory.join("\n");
    const currentResponse =
      state.investmentDebateState.bullHistory[
        state.investmentDebateState.bullHistory.length - 1
      ] || "No bull argument yet.";
    const pastMemory = "";

    const prompt = BEAR_PROMPT_TEMPLATE(
      reports,
      history,
      currentResponse,
      pastMemory,
    );
    const response = await model.invoke([new HumanMessage(prompt)]);

    return {
      investmentDebateState: {
        ...state.investmentDebateState,
        bearHistory: [
          ...state.investmentDebateState.bearHistory,
          response.content as string,
        ],
      },
    };
  };

  return { bullResearcher, bearResearcher };
};
