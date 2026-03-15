import { Spot } from "@binance/connector";

export class BinanceClient {
  private client: Spot;

  constructor(apiKey?: string, apiSecret?: string) {
    // For public endpoints, apiKey and apiSecret are optional
    this.client = new Spot(apiKey, apiSecret);
  }

  getSpotClient(): Spot {
    return this.client;
  }
}
