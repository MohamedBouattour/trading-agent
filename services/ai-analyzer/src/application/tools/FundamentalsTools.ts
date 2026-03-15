import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { IMarketDataProvider } from "../../domain/ports/Ports.js";

export const createFundamentalsTools = (
  marketProvider: IMarketDataProvider,
) => {
  const getFundamentals = tool(
    async ({ symbol }) => {
      try {
        const ticker = await marketProvider.getTicker(symbol);
        return JSON.stringify({
          symbol: symbol,
          tickerInfo: ticker,
          description:
            "Fundamental data for crypto is limited primarily to market cap, volume, and supply.",
          warning:
            "Balance sheets and income statements are typically not applicable to crypto assets in the same way as stocks.",
        });
      } catch (err) {
        return JSON.stringify({ error: `Could not fetch data for ${symbol}` });
      }
    },
    {
      name: "get_fundamentals",
      description: "Get comprehensive fundamental information for the asset.",
      schema: z.object({
        symbol: z.string().describe("The asset symbol"),
      }),
    },
  );

  const getFinancialStatement = (name: string, description: string) =>
    tool(
      async ({ symbol }) => {
        return JSON.stringify({
          message: `${name} is generally not applicable to crypto assets on Binance. See exchange info for asset details.`,
          data: {},
        });
      },
      {
        name: `get_${name.toLowerCase().replace(" ", "_")}`,
        description: description,
        schema: z.object({
          symbol: z.string().describe("The asset symbol"),
        }),
      },
    );

  return [
    getFundamentals,
    getFinancialStatement("balance_sheet", "Fetch the latest balance sheet."),
    getFinancialStatement("cashflow", "Fetch the latest cash flow statement."),
    getFinancialStatement(
      "income_statement",
      "Fetch the latest income statement.",
    ),
  ];
};
