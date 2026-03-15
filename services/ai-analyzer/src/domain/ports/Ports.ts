import {
  Candle,
  Ticker,
  OrderBook,
} from "../market/entities/MarketEntities.js";

export interface IMarketDataProvider {
  getOHLCV(symbol: string, interval: string, limit?: number): Promise<Candle[]>;
  getTicker(symbol: string): Promise<Ticker>;
  getOrderBook(symbol: string, limit?: number): Promise<OrderBook>;
}

export interface IMemoryStore {
  getSimilarSituations(currentSituation: string, k?: number): Promise<string[]>;
  addSituation(situation: string, reflection: string): Promise<void>;
}
