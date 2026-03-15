import { IMarketDataProvider } from "../../domain/ports/Ports.js";
import {
  Candle,
  Ticker,
  OrderBook,
} from "../../domain/market/entities/MarketEntities.js";
import { BinanceClient } from "./BinanceClient.js";

export class BinanceMarketAdapter implements IMarketDataProvider {
  constructor(private binanceClient: BinanceClient) {}

  async getOHLCV(
    symbol: string,
    interval: string,
    limit: number = 500,
  ): Promise<Candle[]> {
    const client = this.binanceClient.getSpotClient();
    const response = await client.klines(symbol, interval, { limit });

    // Binance klines response format:
    // [
    //   [
    //     1499040000000,      // Open time
    //     "0.01634790",       // Open
    //     "0.80000000",       // High
    //     "0.01575800",       // Low
    //     "0.01577100",       // Close
    //     "148976.11427815",  // Volume
    //     1499644799999,      // Close time
    //     "2434.19055334",    // Quote asset volume
    //     308,                // Number of trades
    //     "1756.87402397",    // Taker buy base asset volume
    //     "28.46694368",      // Taker buy quote asset volume
    //     "17928899.62484339" // Ignore.
    //   ]
    // ]
    return response.data.map((k: any) => ({
      openTime: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
      closeTime: k[6],
    }));
  }

  async getTicker(symbol: string): Promise<Ticker> {
    const client = this.binanceClient.getSpotClient();
    const response = await client.ticker24hr(symbol);
    const data = response.data;

    return {
      symbol: data.symbol,
      price: parseFloat(data.lastPrice),
      priceChangePercent: parseFloat(data.priceChangePercent),
      volume: parseFloat(data.volume),
    };
  }

  async getOrderBook(symbol: string, limit: number = 100): Promise<OrderBook> {
    const client = this.binanceClient.getSpotClient();
    const response = await client.depth(symbol, { limit });
    const data = response.data;

    return {
      symbol,
      bids: data.bids.map((b: any) => ({
        price: parseFloat(b[0]),
        quantity: parseFloat(b[1]),
      })),
      asks: data.asks.map((a: any) => ({
        price: parseFloat(a[0]),
        quantity: parseFloat(a[1]),
      })),
    };
  }
}
