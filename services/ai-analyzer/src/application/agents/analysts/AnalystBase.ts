import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage } from "@langchain/core/messages";
import { AgentState } from "../../../domain/agents/entities/AgentState.js";
import { createReactAgent } from "@langchain/langgraph/prebuilt";

export const COLLABORATION_PREFIX = `You are a helpful AI assistant, collaborating with other assistants.
Use the provided tools to progress towards answering the question.
If you are unable to fully answer, that's OK, another assistant with different tools will help where you left off.
Execute what you can to make progress.
If you have a final answer, prefix your response with FINAL ANSWER so the team knows to stop.
You are part of a larger team where each member has a specific role.
Be professional, concise, and focused on your specific domain.`;

export type AnalystOutputKey =
  | "marketReport"
  | "sentimentReport"
  | "newsReport"
  | "fundamentalsReport";

export const createAnalystNode = (
  model: BaseChatModel,
  tools: any[],
  systemMessage: string,
  outputKey: AnalystOutputKey,
) => {
  const agent = createReactAgent({
    llm: model,
    tools,
    messageModifier: `${COLLABORATION_PREFIX}\n\n${systemMessage}`,
  });

  return async (state: AgentState) => {
    // Gemini requires role alternation and MUST end with a User (Human) role.
    // We append a fresh HumanMessage that restates the context and task.
    const taskMessage = new HumanMessage(
      `Context: Asset ${state.ticker}, Date ${state.currentDate}.
Your Task: ${systemMessage}
Use your tools to research and produce the report now.`,
    );

    const messages = [...(state.messages || []), taskMessage];

    const result = await agent.invoke({ messages });

    const lastMessage = result.messages[result.messages.length - 1];
    const report =
      typeof lastMessage.content === "string"
        ? lastMessage.content
        : JSON.stringify(lastMessage.content);

    return {
      messages: [lastMessage],
      [outputKey]: report,
    };
  };
};
