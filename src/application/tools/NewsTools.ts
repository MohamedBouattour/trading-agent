import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const createNewsTools = () => {
  const getNews = tool(
    async ({ query, start_date, end_date }) => {
      // Mock for now
      return JSON.stringify({
        status: "success",
        message: `No news found for query: ${query} in the specified range.`,
        data: [],
      });
    },
    {
      name: "get_news",
      description:
        "Search for company-specific news and social media discussions.",
      schema: z.object({
        query: z.string().describe("Search query for the company"),
        start_date: z.string().describe("Start date (YYYY-MM-DD)"),
        end_date: z.string().describe("End date (YYYY-MM-DD)"),
      }),
    },
  );

  const getGlobalNews = tool(
    async ({ curr_date, look_back_days = 7, limit = 10 }) => {
      // Mock for now
      return JSON.stringify({
        status: "success",
        message: "Macroeconomic news data is currently unavailable.",
        data: [],
      });
    },
    {
      name: "get_global_news",
      description: "Fetch broader macroeconomic news and global trends.",
      schema: z.object({
        curr_date: z.string().describe("Current date"),
        look_back_days: z
          .number()
          .optional()
          .describe("Number of days to look back"),
        limit: z.number().optional().describe("Number of news items to fetch"),
      }),
    },
  );

  return [getNews, getGlobalNews];
};
