#!/usr/bin/env tsx
/**
 * Trading Bot – hourly runner for Docker / VPS
 *
 * Runs every hour (via cron inside Docker).
 * 1. Finds the latest analysis state.json for TICKER
 * 2. Fetches 500 × 1h Binance candles
 * 3. Asks Gemini for BUY / SELL / HODL
 * 4. Checks current Binance Futures position
 * 5. Executes trade if decision differs from current position
 *
 * Environment variables (set in .env or Docker –e):
 *   TICKER              – Symbol, default BTCUSDT
 *   LEVERAGE            – Futures leverage, default 5
 *   TRADE_USDT          – Margin per trade in USDT, default 100
 *   GOOGLE_API_KEY      – Gemini API key
 *   QUICK_THINK_MODEL   – Gemini model, default gemini-2.5-flash
 *   BINANCE_API_KEY     – Binance API key (Futures enabled)
 *   BINANCE_API_SECRET  – Binance Secret
 *   RESULTS_DIR         – Path to results directory, default ./results
 *   DRY_RUN             – Set to "true" to skip actual order placement
 */

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import http from "node:http";
import crypto from "node:crypto";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage } from "@langchain/core/messages";

// ─── Config ──────────────────────────────────────────────────────────────────

const TICKER = process.env.TICKER ?? "BTCUSDT";
const LEVERAGE = parseInt(process.env.LEVERAGE ?? "5", 10);
const TRADE_USDT = parseFloat(process.env.TRADE_USDT ?? "100");
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const MODEL = process.env.QUICK_THINK_MODEL ?? "gemini-2.5-flash";
const BINANCE_KEY = process.env.BINANCE_API_KEY ?? "";
const BINANCE_SECRET = process.env.BINANCE_API_SECRET ?? "";
const RESULTS_DIR = process.env.RESULTS_DIR ?? "./results";
const DRY_RUN = process.env.DRY_RUN === "true";
const FUTURES_BASE = "https://fapi.binance.com";
const LOG_FILE = process.env.LOG_FILE ?? "/app/logs/bot.log";

// ─── Logging ─────────────────────────────────────────────────────────────────

function log(
  msg: string,
  level: "INFO" | "WARN" | "ERROR" | "SUCCESS" = "INFO",
) {
  if (level === "INFO") {
    if (msg.includes("⚠") || msg.includes("[DRY_RUN]")) level = "WARN";
    else if (
      msg.includes("FATAL") ||
      msg.toLowerCase().includes("error") ||
      msg.includes("Failed")
    )
      level = "ERROR";
    else if (msg.includes("placed →") || msg.includes("complete"))
      level = "SUCCESS";
  }

  const ts = new Date().toISOString().replace("T", " ").substring(0, 19);
  const levelStr = level.padEnd(7, " ");
  const cleanMsg = msg.replace("⚠  ", "").replace("✖ FATAL: ", "");

  const line = `[${ts}] [${levelStr}] ${cleanMsg}`;

  if (level === "ERROR") console.error(line);
  else if (level === "WARN") console.warn(line);
  else console.log(line);

  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, line + "\n", "utf-8");
  } catch {
    /* ignore log write errors */
  }
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function rawGet(
  url: string,
  headers: Record<string, string> = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    const req = client.get(url, { headers }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve(data));
    });
    req.on("error", reject);
  });
}

function rawPost(
  url: string,
  body: string,
  headers: Record<string, string>,
  method: "POST" | "DELETE" = "POST",
): Promise<string> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const options = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: method,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(body),
        ...headers,
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve(data));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ─── Binance Futures helpers ─────────────────────────────────────────────────

function signQuery(params: Record<string, string | number>): string {
  const qs = Object.entries(params)
    .map(([k, v]) => k + "=" + v)
    .join("&");
  const sig = crypto
    .createHmac("sha256", BINANCE_SECRET)
    .update(qs)
    .digest("hex");
  return qs + "&signature=" + sig;
}

async function futuresGet(
  endpoint: string,
  params: Record<string, any> = {},
): Promise<any> {
  const signed = signQuery({ ...params, timestamp: Date.now() });
  const url = FUTURES_BASE + endpoint + "?" + signed;
  const raw = await rawGet(url, { "X-MBX-APIKEY": BINANCE_KEY });
  return JSON.parse(raw);
}

async function futuresPost(
  endpoint: string,
  params: Record<string, any> = {},
): Promise<any> {
  const signed = signQuery({ ...params, timestamp: Date.now() });
  const url = FUTURES_BASE + endpoint;
  const raw = await rawPost(
    url,
    signed,
    { "X-MBX-APIKEY": BINANCE_KEY },
    "POST",
  );
  return JSON.parse(raw);
}

async function futuresDelete(
  endpoint: string,
  params: Record<string, any> = {},
): Promise<any> {
  const signed = signQuery({ ...params, timestamp: Date.now() });
  const url = FUTURES_BASE + endpoint;
  const raw = await rawPost(
    url,
    signed,
    { "X-MBX-APIKEY": BINANCE_KEY },
    "DELETE",
  );
  return JSON.parse(raw);
}

export interface PositionRisk {
  positionAmt: number;
  entryPrice: number;
  unRealizedProfit: number;
  markPrice: number;
}

/** Returns position risk info */
async function getPositionRisk(symbol: string): Promise<PositionRisk> {
  const data = await futuresGet("/fapi/v2/positionRisk", { symbol });
  if (!Array.isArray(data) || data.length === 0) {
    return { positionAmt: 0, entryPrice: 0, unRealizedProfit: 0, markPrice: 0 };
  }
  return {
    positionAmt: parseFloat(data[0].positionAmt ?? "0"),
    entryPrice: parseFloat(data[0].entryPrice ?? "0"),
    unRealizedProfit: parseFloat(data[0].unRealizedProfit ?? "0"),
    markPrice: parseFloat(data[0].markPrice ?? "0"),
  };
}

/** Get latest mark price for size calculation */
async function getMarkPrice(symbol: string): Promise<number> {
  const raw = await rawGet(
    "https://fapi.binance.com/fapi/v1/premiumIndex?symbol=" + symbol,
  );
  const d = JSON.parse(raw);
  return parseFloat(d.markPrice ?? d.indexPrice ?? "0");
}

/** Set leverage for the symbol */
async function setLeverage(symbol: string, leverage: number): Promise<void> {
  if (DRY_RUN) {
    log("[DRY_RUN] setLeverage " + leverage + "x for " + symbol);
    return;
  }
  await futuresPost("/fapi/v1/leverage", { symbol, leverage });
}

/**
 * Place a market order on Binance Futures.
 * side: "BUY" | "SELL"
 * reduceOnly: true to close existing position
 */
async function placeMarket(
  symbol: string,
  side: "BUY" | "SELL",
  qty: number,
  reduceOnly = false,
): Promise<void> {
  const qtyStr = qty.toFixed(3);
  if (DRY_RUN) {
    log(
      "[DRY_RUN] MARKET " +
        side +
        " " +
        qtyStr +
        " " +
        symbol +
        (reduceOnly ? " reduceOnly" : ""),
    );
    return;
  }
  const params: Record<string, any> = {
    symbol,
    side,
    type: "MARKET",
    quantity: qtyStr,
  };
  if (reduceOnly) params.reduceOnly = "true";
  const res = await futuresPost("/fapi/v1/order", params);
  if (res.code) throw new Error("Binance order error: " + JSON.stringify(res));
  log(
    "Order placed → " +
      side +
      " " +
      qtyStr +
      " " +
      symbol +
      " orderId:" +
      res.orderId,
  );
}

/** Cancel all open orders for a symbol (useful for clearing out old TP/SL) */
async function cancelAllOpenOrders(symbol: string): Promise<void> {
  if (DRY_RUN) {
    log("[DRY_RUN] cancelAllOpenOrders for " + symbol);
    return;
  }
  const res = await futuresDelete("/fapi/v1/allOpenOrders", { symbol });
  if (res.code && res.code !== 200) {
    log("⚠ cancelAllOpenOrders returned: " + JSON.stringify(res));
  } else {
    log("Cancelled all open orders for " + symbol);
  }
}

/**
 * Place a STOP_MARKET or TAKE_PROFIT_MARKET exit order.
 * Using closePosition=true closes the entire position safely.
 */
async function placeExitOrder(
  symbol: string,
  side: "BUY" | "SELL",
  type: "STOP_MARKET" | "TAKE_PROFIT_MARKET",
  stopPrice: number,
): Promise<void> {
  const priceStr = stopPrice.toFixed(2);
  if (DRY_RUN) {
    log(
      "[DRY_RUN] " +
        type +
        " " +
        side +
        " " +
        symbol +
        " at stopPrice " +
        priceStr,
    );
    return;
  }
  const params: Record<string, any> = {
    symbol,
    side,
    type,
    stopPrice: priceStr,
    closePosition: "true",
    timeInForce: "GTC",
  };
  const res = await futuresPost("/fapi/v1/order", params);
  if (res.code) {
    log("⚠ Failed to place " + type + ": " + JSON.stringify(res));
  } else {
    log(
      "Exit Order placed → " +
        type +
        " " +
        side +
        " @ " +
        priceStr +
        " orderId:" +
        res.orderId,
    );
  }
}

/** Calculate quantity in base asset from USDT margin and leverage */
function calcQty(tradeUsdt: number, leverage: number, price: number): number {
  const notional = tradeUsdt * leverage;
  const raw = notional / price;
  // Round down to 3 decimal places (Binance BTCUSDT step 0.001)
  return Math.floor(raw * 1000) / 1000;
}

// ─── Candle fetching ─────────────────────────────────────────────────────────

interface Candle {
  openTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  closeTime: number;
}

async function fetchCandles(
  symbol: string,
  interval = "1h",
  limit = 500,
): Promise<Candle[]> {
  const url =
    "https://api.binance.com/api/v3/klines?symbol=" +
    symbol +
    "&interval=" +
    interval +
    "&limit=" +
    limit;
  const raw = await rawGet(url);
  return (JSON.parse(raw) as any[][]).map((r) => ({
    openTime: r[0],
    open: r[1],
    high: r[2],
    low: r[3],
    close: r[4],
    volume: r[5],
    closeTime: r[6],
  }));
}

// ─── Technical indicators & candle section ────────────────────────────────────

function calcEma(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = 0,
    seeded = false,
    count = 0,
    sum = 0;
  for (let i = 0; i < values.length; i++) {
    if (!seeded) {
      sum += values[i];
      count++;
      if (count === period) {
        prev = sum / period;
        seeded = true;
        out.push(prev);
      } else out.push(NaN);
    } else {
      prev = values[i] * k + prev * (1 - k);
      out.push(prev);
    }
  }
  return out;
}

function calcRsi(closes: number[], period = 14): number[] {
  const out: number[] = new Array(period).fill(NaN);
  let avgG = 0,
    avgL = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) avgG += d;
    else avgL += Math.abs(d);
  }
  avgG /= period;
  avgL /= period;
  out.push(100 - 100 / (1 + avgG / (avgL || 1e-10)));
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const g = d > 0 ? d : 0,
      l = d < 0 ? Math.abs(d) : 0;
    avgG = (avgG * (period - 1) + g) / period;
    avgL = (avgL * (period - 1) + l) / period;
    out.push(100 - 100 / (1 + avgG / (avgL || 1e-10)));
  }
  return out;
}

function detectPattern(c: Candle): string {
  const o = parseFloat(c.open),
    h = parseFloat(c.high),
    l = parseFloat(c.low),
    cl = parseFloat(c.close);
  const body = Math.abs(cl - o),
    range = h - l || 1e-10;
  const uw = h - Math.max(o, cl),
    lw = Math.min(o, cl) - l;
  const br = body / range;
  if (br < 0.1) return "doji";
  if (lw > body * 2 && uw < body * 0.3) return cl > o ? "hammer" : "inv-hammer";
  if (uw > body * 2 && lw < body * 0.3)
    return cl < o ? "shooting-star" : "hanging-man";
  if (br > 0.7) return cl > o ? "bull-marubozu" : "bear-marubozu";
  return "";
}

function buildCandleSection(candles: Candle[]): string {
  const closes = candles.map((c) => parseFloat(c.close));
  const volumes = candles.map((c) => parseFloat(c.volume));
  const ema9 = calcEma(closes, 9);
  const ema21 = calcEma(closes, 21);
  const rsi14 = calcRsi(closes, 14);
  const avgVol = volumes.reduce((a, b) => a + b, 0) / volumes.length;
  const vol20 = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const last = candles[candles.length - 1];
  const first = candles[0];
  const curE9 = ema9[ema9.length - 1];
  const curE21 = ema21[ema21.length - 1];
  const curRsi = rsi14[rsi14.length - 1];
  const pct = (
    ((parseFloat(last.close) - parseFloat(first.open)) /
      parseFloat(first.open)) *
    100
  ).toFixed(2);
  const upCount = candles
    .slice(-20)
    .filter((c) => parseFloat(c.close) > parseFloat(c.open)).length;

  const header = [
    "=== PERIOD: " +
      new Date(first.openTime).toISOString() +
      " to " +
      new Date(last.closeTime).toISOString(),
    "Price Change: " +
      pct +
      "%  |  EMA9: " +
      (isNaN(curE9) ? "N/A" : curE9.toFixed(2)) +
      "  |  EMA21: " +
      (isNaN(curE21) ? "N/A" : curE21.toFixed(2)) +
      "  |  RSI14: " +
      (isNaN(curRsi) ? "N/A" : curRsi.toFixed(2)),
    "Vol avg 500h: " +
      avgVol.toFixed(2) +
      "  |  Vol avg 20h: " +
      vol20.toFixed(2) +
      " [" +
      (vol20 > avgVol ? "ABOVE AVG" : "BELOW AVG") +
      "]",
    "Bull candles last 20: " + upCount + "/20",
    "timestamp,open,high,low,close,volume,ema9,ema21,rsi14,pattern",
  ].join("\n");

  const rows = candles.map((c, i) => {
    return [
      new Date(c.openTime).toISOString().slice(0, 16),
      parseFloat(c.open).toFixed(2),
      parseFloat(c.high).toFixed(2),
      parseFloat(c.low).toFixed(2),
      parseFloat(c.close).toFixed(2),
      parseFloat(c.volume).toFixed(2),
      isNaN(ema9[i]) ? "" : ema9[i].toFixed(2),
      isNaN(ema21[i]) ? "" : ema21[i].toFixed(2),
      isNaN(rsi14[i]) ? "" : rsi14[i].toFixed(1),
      detectPattern(c),
    ].join(",");
  });

  return header + "\n" + rows.join("\n");
}

// ─── State file discovery ──────────────────────────────────────────────────────

function findLatestStateFile(
  ticker: string,
): { filePath: string; date: string } | null {
  const dir = path.resolve(RESULTS_DIR, ticker);
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith("_state.json"))
    .sort()
    .reverse(); // newest first (ISO date prefix sorts correctly)
  if (files.length === 0) return null;
  const f = files[0];
  const date = f.replace("_state.json", "");
  return { filePath: path.join(dir, f), date };
}

// ─── Gemini decision ──────────────────────────────────────────────────────────

export interface DecisionOutput {
  decision: "BUY" | "SELL" | "HODL";
  reason: string;
  tp: number | null;
  sl: number | null;
}

async function getDecision(
  state: Record<string, any> | null,
  candles: Candle[],
  ticker: string,
  date: string,
  position: PositionRisk,
): Promise<DecisionOutput> {
  const model = new ChatGoogleGenerativeAI({
    model: MODEL,
    temperature: 0.2,
    maxRetries: 3,
    apiKey: GOOGLE_API_KEY,
  });

  const candleSection = buildCandleSection(candles);

  const reportSection = state
    ? [
        "### Market Analysis",
        state.marketReport ?? "N/A",
        "### Sentiment Analysis",
        state.sentimentReport ?? "N/A",
        "### News Analysis",
        state.newsReport ?? "N/A",
        "### Fundamentals",
        state.fundamentalsReport ?? "N/A",
        "### Investment Plan",
        state.investmentPlan ?? "N/A",
        "### Prior Decision",
        state.finalTradeDecision ?? "N/A",
      ].join("\n\n")
    : "(No cached analysis available – base decision on candle data only.)";

  const isLong = position.positionAmt > 0.0009;
  const isShort = position.positionAmt < -0.0009;
  const posSide = isLong ? "LONG" : isShort ? "SHORT" : "FLAT";
  const pnlStr = position.unRealizedProfit.toFixed(2);

  const positionSection = [
    "Side: " + posSide,
    "Size: " + position.positionAmt,
    "Entry Price: " + position.entryPrice.toFixed(2),
    "Current Mark Price: " + position.markPrice.toFixed(2),
    "Unrealized PnL: " + pnlStr + " USDT",
  ].join("\n");

  const prompt = [
    "You are an expert crypto trading decision engine.",
    "Analyze the data below and output ONLY a valid JSON object.",
    "Do not include markdown blocks or any other text.",
    "",
    "Format:",
    "{",
    '  "decision": "BUY" | "SELL" | "HODL",',
    '  "reason": "Brief explanation of your decision",',
    '  "tp": number | null, // take profit price level, or null if none',
    '  "sl": number | null  // stop loss price level, or null if none',
    "}",
    "",
    "Rules for SL/TP:",
    "- If you suggest BUY (LONG) or currently hold LONG, TP should be > current price, SL should be < current price.",
    "- If you suggest SELL (SHORT) or currently hold SHORT, TP should be < current price, SL should be > current price.",
    "- Base them on recent structural highs/lows (e.g. recent wick lows for SL on a long).",
    "",
    "Look for: EMA crossovers, RSI divergence/extremes, volume spikes, candlestick patterns,",
    "momentum (consecutive candles), price relative to VWAP/EMA.",
    "",
    "=== CURRENT POSITION (" + ticker + ") ===",
    positionSection,
    "",
    "=== MULTI-AGENT ANALYSIS REPORT (" + ticker + " / " + date + ") ===",
    reportSection,
    "",
    "=== LIVE BINANCE 1H CANDLES (500) ===",
    candleSection,
    "",
    "Reply ONLY with the JSON format requested above.",
  ].join("\n");

  const response = await model.invoke([new HumanMessage(prompt)]);
  let text =
    typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);

  // Clean markdown ticks if present
  text = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  try {
    const parsed = JSON.parse(text);
    const result: DecisionOutput = {
      decision: ["BUY", "SELL"].includes(parsed.decision)
        ? parsed.decision
        : "HODL",
      reason: parsed.reason || "No reason",
      tp: typeof parsed.tp === "number" ? parsed.tp : null,
      sl: typeof parsed.sl === "number" ? parsed.sl : null,
    };
    return result;
  } catch (err) {
    log(
      "⚠  Could not parse JSON decision from model output: " +
        text.slice(0, 200),
    );
    return { decision: "HODL", reason: "Parse error", tp: null, sl: null };
  }
}

// ─── Trade execution ──────────────────────────────────────────────────────────

async function executeTrade(
  decisionOut: DecisionOutput,
  symbol: string,
  currentPosition: PositionRisk,
): Promise<void> {
  const { decision, tp, sl } = decisionOut;
  log(
    "Gemini Output >> Decision: " +
      decision +
      ", TP: " +
      tp +
      ", SL: " +
      sl +
      " | Reason: " +
      decisionOut.reason,
  );

  const posAmt = currentPosition.positionAmt;
  const isLong = posAmt > 0.0009;
  const isShort = posAmt < -0.0009;

  if (decision === "HODL") {
    log("Decision is HODL – trade unchanged. Updating TP/SL if needed...");
  } else {
    // Set leverage first
    await setLeverage(symbol, LEVERAGE);

    if (decision === "BUY") {
      if (isLong) {
        log("Already LONG – skipping trade entry.");
      } else {
        const price = await getMarkPrice(symbol);
        const qty = calcQty(TRADE_USDT, LEVERAGE, price);
        if (qty < 0.001)
          throw new Error("Calculated quantity too small: " + qty);
        if (isShort) {
          log("Closing existing SHORT before going LONG...");
          await placeMarket(symbol, "BUY", Math.abs(posAmt), true);
        }
        log(
          "Opening LONG " +
            qty +
            " " +
            symbol +
            " @ ~" +
            price.toFixed(2) +
            " (" +
            LEVERAGE +
            "x)",
        );
        await placeMarket(symbol, "BUY", qty);
      }
    } else if (decision === "SELL") {
      if (isShort) {
        log("Already SHORT – skipping trade entry.");
      } else {
        const price = await getMarkPrice(symbol);
        const qty = calcQty(TRADE_USDT, LEVERAGE, price);
        if (qty < 0.001)
          throw new Error("Calculated quantity too small: " + qty);
        if (isLong) {
          log("Closing existing LONG before going SHORT...");
          await placeMarket(symbol, "SELL", Math.abs(posAmt), true);
        }
        log(
          "Opening SHORT " +
            qty +
            " " +
            symbol +
            " @ ~" +
            price.toFixed(2) +
            " (" +
            LEVERAGE +
            "x)",
        );
        await placeMarket(symbol, "SELL", qty);
      }
    }
  }

  // After potentially entering/exiting, refetch position risk to see if we have an active position
  const finalPos = await getPositionRisk(symbol);
  const finalIsLong = finalPos.positionAmt > 0.0009;
  const finalIsShort = finalPos.positionAmt < -0.0009;

  if (finalIsLong || finalIsShort) {
    // We have a position running. Cancel old orders and set new TP/SL.
    log("Position is currently active. Refreshing TP/SL...");
    await cancelAllOpenOrders(symbol);

    // For a LONG, exit side is SELL. For a SHORT, exit side is BUY.
    const exitSide = finalIsLong ? "SELL" : "BUY";

    if (sl !== null) {
      // Basic validation: SL for long must be below mark price. SL for short must be above mark price.
      const isValidSl = finalIsLong
        ? sl < finalPos.markPrice
        : sl > finalPos.markPrice;
      if (isValidSl) {
        await placeExitOrder(symbol, exitSide, "STOP_MARKET", sl);
      } else {
        log(
          "⚠ Provided SL " +
            sl +
            " is invalid against mark price " +
            finalPos.markPrice +
            ". Skipping SL.",
        );
      }
    }

    if (tp !== null) {
      // Basic validation: TP for long must be above mark price. TP for short must be below mark price.
      const isValidTp = finalIsLong
        ? tp > finalPos.markPrice
        : tp < finalPos.markPrice;
      if (isValidTp) {
        await placeExitOrder(symbol, exitSide, "TAKE_PROFIT_MARKET", tp);
      } else {
        log(
          "⚠ Provided TP " +
            tp +
            " is invalid against mark price " +
            finalPos.markPrice +
            ". Skipping TP.",
        );
      }
    }
  } else {
    // Flattened or no position. Clean up orders.
    log("No active position remaining. Cancelling any open orders.");
    await cancelAllOpenOrders(symbol);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const ts = new Date().toISOString();
  log("═".repeat(60));
  log(
    "TradingBot run  ticker=" +
      TICKER +
      "  leverage=" +
      LEVERAGE +
      "x  tradeUsdt=" +
      TRADE_USDT,
  );
  if (DRY_RUN) log("*** DRY_RUN MODE – no orders will be placed ***");

  // 1. Find latest state file (don't block if missing)
  const stateEntry = findLatestStateFile(TICKER);
  let state: Record<string, any> | null = null;
  let stateDate = new Date().toISOString().slice(0, 10);

  if (stateEntry) {
    const ageMs = Date.now() - new Date(stateEntry.date).getTime();
    const ageDays = Math.floor(ageMs / 86_400_000);
    stateDate = stateEntry.date;
    try {
      state = JSON.parse(fs.readFileSync(stateEntry.filePath, "utf-8"));
      log("State loaded: " + stateEntry.filePath + " (age: " + ageDays + "d)");
      if (ageDays > 7)
        log(
          "⚠  State is " +
            ageDays +
            " days old – consider running the analyse CLI to refresh.",
        );
    } catch (e: any) {
      log("⚠  Could not parse state file: " + e.message);
    }
  } else {
    log(
      "⚠  No state file found in " +
        path.resolve(RESULTS_DIR, TICKER) +
        " – using candle data only.",
    );
  }

  // 2. Fetch candles
  log("Fetching 500 × 1h candles for " + TICKER + "...");
  const candles = await fetchCandles(TICKER);
  log(
    "Candles fetched: " +
      candles.length +
      "  latest close: " +
      candles[candles.length - 1]?.close,
  );

  // 2.5 Fetch current position risk
  log("Fetching current position risk for " + TICKER + "...");
  const positionRisk = await getPositionRisk(TICKER);

  // 3. Get Gemini decision
  log("Asking Gemini (" + MODEL + ") for decision and TP/SL...");
  const decisionOut = await getDecision(
    state,
    candles,
    TICKER,
    stateDate,
    positionRisk,
  );

  // 4. Execute on Binance Futures
  await executeTrade(decisionOut, TICKER, positionRisk);

  log("Run complete.");
  log("═".repeat(60));
}

main().catch((err) => {
  log("✖ FATAL: " + (err.message ?? String(err)));
  process.exit(1);
});
