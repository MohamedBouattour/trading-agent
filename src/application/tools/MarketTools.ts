import { tool } from "@langchain/core/tools";
import { z } from "zod";
import * as ti from "technicalindicators";
import { IMarketDataProvider } from "../../domain/ports/Ports.js";

export const createMarketTools = (marketProvider: IMarketDataProvider) => {
  const getStockData = tool(
    async ({ symbol, interval = "1d", limit = 100 }) => {
      const candles = await marketProvider.getOHLCV(symbol, interval, limit);
      return JSON.stringify(candles);
    },
    {
      name: "get_stock_data",
      description:
        "Fetch OHLCV candlestick data for a given symbol and interval.",
      schema: z.object({
        symbol: z.string().describe("The ticker symbol (e.g., BTCUSDT)"),
        interval: z
          .string()
          .optional()
          .describe("The candlestick interval (e.g., 1h, 1d)"),
        limit: z.number().optional().describe("Number of candles to fetch"),
      }),
    },
  );

  const getIndicators = tool(
    async ({ symbol, interval = "1d", indicators }) => {
      const candles = await marketProvider.getOHLCV(symbol, interval, 200); // Fetch enough for moving averages
      const closes = candles.map((c) => c.close);
      const highs = candles.map((c) => c.high);
      const lows = candles.map((c) => c.low);
      const volumes = candles.map((c) => c.volume);

      const results: Record<string, any> = {};

      for (const indicator of indicators) {
        switch (indicator.toLowerCase()) {
          case "rsi":
            results.rsi = ti.RSI.calculate({ values: closes, period: 14 });
            break;
          case "macd":
            results.macd = ti.MACD.calculate({
              values: closes,
              fastPeriod: 12,
              slowPeriod: 26,
              signalPeriod: 9,
              SimpleMAOscillator: false,
              SimpleMASignal: false,
            });
            break;
          case "sma":
            results.sma20 = ti.SMA.calculate({ values: closes, period: 20 });
            results.sma50 = ti.SMA.calculate({ values: closes, period: 50 });
            break;
          case "ema":
            results.ema20 = ti.EMA.calculate({ values: closes, period: 20 });
            break;
          case "boll":
            results.bollinger = ti.BollingerBands.calculate({
              values: closes,
              period: 20,
              stdDev: 2,
            });
            break;
          case "atr":
            results.atr = ti.ATR.calculate({
              high: highs,
              low: lows,
              close: closes,
              period: 14,
            });
            break;
          case "vwma":
            // technicalindicators might not have VWMA directly, but we can approximate or use a custom implementation
            // For now, let's provide basic ones mentioned in the plan
            break;
        }
      }

      return JSON.stringify(results);
    },
    {
      name: "get_indicators",
      description: "Calculate technical indicators for a given symbol.",
      schema: z.object({
        symbol: z.string().describe("The ticker symbol"),
        interval: z.string().optional().describe("Interval"),
        indicators: z
          .array(z.string())
          .describe("List of indicator names (rsi, macd, sma, ema, boll, atr)"),
      }),
    },
  );

  return [getStockData, getIndicators];
};
