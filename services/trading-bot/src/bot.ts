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
const DECISIONS_FILE = path.resolve(RESULTS_DIR, TICKER + "_decisions.json");

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

  // Note: We only console.log here. Docker cron is configured with `>> /app/logs/bot.log 2>&1`,
  // so if we ALSO wrote to fs.appendFileSync here, it would appear twice in the file.
  if (level === "ERROR") console.error(line);
  else if (level === "WARN") console.warn(line);
  else console.log(line);
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

/** Get available USDT balance */
async function getUsdtBalance(): Promise<number> {
  const data = await futuresGet("/fapi/v2/balance");
  if (Array.isArray(data)) {
    const usdt = data.find((a: any) => a.asset === "USDT");
    if (usdt) {
      return parseFloat(usdt.availableBalance ?? "0");
    }
  }
  return 0;
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
 * Place a STOP_MARKET or TAKE_PROFIT_MARKET exit order via the Binance
 * Futures **Algo Order** endpoint: POST /fapi/v1/algoOrder
 *
 * The standard /fapi/v1/order returns -4120 for these order types.
 * The algo endpoint requires:
 *   - algoType: "CONDITIONAL"
 *   - closePosition: "true" (auto-closes the full position, no qty needed)
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
    algoType: "CONDITIONAL",
    triggerPrice: priceStr,
    closePosition: "true",
  };
  const res = await futuresPost("/fapi/v1/algoOrder", params);
  if (res.code) {
    if (res.code === -4130) {
      log("TP/SL " + type + " already exists for " + symbol + " – skipping.");
    } else {
      log("⚠ Failed to place " + type + ": " + JSON.stringify(res));
    }
  } else {
    log(
      "Exit Order placed → " +
        type +
        " " +
        side +
        " @ " +
        priceStr +
        " algoId:" +
        (res.algoId ?? res.clientAlgoId ?? "ok"),
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
    '  "tp": number,  // REQUIRED – take profit price level (never null)',
    '  "sl": number   // REQUIRED – stop loss price level (never null)',
    "}",
    "",
    "Rules for SL/TP (MANDATORY – you MUST always provide both tp and sl as numbers):",
    "- For BUY/LONG: tp MUST be strictly above the current mark price, sl MUST be strictly below.",
    "- For SELL/SHORT: tp MUST be strictly below the current mark price, sl MUST be strictly above.",
    "- For HODL: use the same direction as the current open position to calculate tp/sl. If FLAT, use the nearest swing high as tp and swing low as sl.",
    "- Base sl on the most recent structural swing low (for longs) or swing high (for shorts) from the 500 candles provided.",
    "- Base tp on the nearest resistance (for longs) or support (for shorts) from the 500 candles provided.",
    "- Risk/reward ratio must be at least 1.5:1 (tp distance >= 1.5x sl distance from entry).",
    "- NEVER return null for tp or sl.",
    "- Output HODL if there is no clear signal, OR if your suggested trade direction is already the same as the current open position.",
    "",
    "Look for: EMA crossovers, RSI divergence/extremes, volume spikes, candlestick patterns,",
    "momentum (consecutive candles), price relative to EMA9/EMA21.",
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
    "Reply ONLY with the JSON. tp and sl must always be numbers.",
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
    const decision: DecisionOutput["decision"] = ["BUY", "SELL"].includes(
      parsed.decision?.toUpperCase(),
    )
      ? (parsed.decision.toUpperCase() as "BUY" | "SELL")
      : "HODL";

    let tp: number | null = typeof parsed.tp === "number" ? parsed.tp : null;
    let sl: number | null = typeof parsed.sl === "number" ? parsed.sl : null;

    // Fallback: auto-calculate TP/SL from candles if model omitted them
    if (tp === null || sl === null) {
      log(
        "⚠  Model did not return tp/sl – calculating fallback from ATR and swing levels.",
      );
      const fallback = calcAtrFallbackTpSl(
        candles,
        decision,
        position.markPrice,
      );
      if (tp === null) tp = fallback.tp;
      if (sl === null) sl = fallback.sl;
      log("Fallback TP: " + tp?.toFixed(2) + "  SL: " + sl?.toFixed(2));
    }

    return { decision, reason: parsed.reason || "No reason", tp, sl };
  } catch (err) {
    log(
      "⚠  Could not parse JSON decision from model output: " +
        text.slice(0, 200),
    );
    // Full fallback on parse error – assume HODL but still compute levels
    const fallback = calcAtrFallbackTpSl(candles, "HODL", position.markPrice);
    return {
      decision: "HODL",
      reason: "Parse error",
      tp: fallback.tp,
      sl: fallback.sl,
    };
  }
}

/**
 * ATR-based TP/SL fallback.
 * Uses 14-period ATR from the last 20 candles to set SL at 1.5×ATR and TP at 2.5×ATR
 * in the appropriate direction. Also clamps to the swing high/low of the last 20 candles.
 */
function calcAtrFallbackTpSl(
  candles: Candle[],
  decision: "BUY" | "SELL" | "HODL",
  markPrice: number,
): { tp: number; sl: number } {
  const last20 = candles.slice(-20);

  // ATR over last 20 candles
  let atrSum = 0;
  for (let i = 1; i < last20.length; i++) {
    const h = parseFloat(last20[i].high);
    const l = parseFloat(last20[i].low);
    const prevC = parseFloat(last20[i - 1].close);
    atrSum += Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC));
  }
  const atr = atrSum / (last20.length - 1);

  // Swing levels
  const swingHigh = Math.max(...last20.map((c) => parseFloat(c.high)));
  const swingLow = Math.min(...last20.map((c) => parseFloat(c.low)));

  if (decision === "SELL") {
    // SHORT: sl above mark, tp below mark
    const sl = Math.min(markPrice + atr * 1.5, swingHigh);
    const tp = Math.max(markPrice - atr * 2.5, swingLow);
    return { tp, sl };
  } else {
    // BUY or HODL (LONG): sl below mark, tp above mark
    const sl = Math.max(markPrice - atr * 1.5, swingLow);
    const tp = Math.min(markPrice + atr * 2.5, swingHigh);
    return { tp, sl };
  }
}

// ─── Trade execution ──────────────────────────────────────────────────────────

async function ensureTpSl(
  symbol: string,
  exitSide: "BUY" | "SELL",
  tp: number | null,
  sl: number | null,
  markPrice: number,
): Promise<void> {
  let slPlaced = false;
  let tpPlaced = false;

  // Cancel existing conditional algo orders for this symbol so we can
  // replace them with the latest TP/SL levels from the model each run.
  if (!DRY_RUN) {
    try {
      const res = await futuresGet("/fapi/v1/openAlgoOrders", {
        algoType: "CONDITIONAL",
      });
      let algoOrders: any[] = [];
      if (Array.isArray(res)) algoOrders = res;
      else if (res?.rows && Array.isArray(res.rows)) algoOrders = res.rows;

      const symbolOrders = algoOrders.filter((o: any) => o.symbol === symbol);
      log(
        "Found " +
          symbolOrders.length +
          " existing algo orders for " +
          symbol +
          ".",
      );

      for (const o of symbolOrders) {
        const algoId = o.algoId ?? o.algoOrderId;
        const currentStopPrice = parseFloat(o.stopPrice || "0");

        // If the order perfectly matches our desired SL, keep it
        if (
          o.side === exitSide &&
          o.type === "STOP_MARKET" &&
          sl !== null &&
          Math.abs(currentStopPrice - sl) < 0.0001
        ) {
          log(
            "SL order " +
              algoId +
              " already at correct price (" +
              sl +
              ") - keeping.",
          );
          slPlaced = true;
          continue;
        }

        // If the order perfectly matches our desired TP, keep it
        if (
          o.side === exitSide &&
          o.type === "TAKE_PROFIT_MARKET" &&
          tp !== null &&
          Math.abs(currentStopPrice - tp) < 0.0001
        ) {
          log(
            "TP order " +
              algoId +
              " already at correct price (" +
              tp +
              ") - keeping.",
          );
          tpPlaced = true;
          continue;
        }

        if (algoId) {
          log(
            "Cancelling old algo order " +
              algoId +
              " (" +
              o.type +
              " @ " +
              o.stopPrice +
              ")...",
          );
          try {
            await futuresDelete("/fapi/v1/algoOrder", { algoId });
          } catch (e) {
            log("⚠ Failed to cancel algo order " + algoId + ": " + e);
          }
        }
      }
    } catch (e) {
      log("⚠ Could not query/cancel existing algo orders: " + e);
    }

    // If we kept both, no need to clear standard open orders.
    // Otherwise clear standard open orders just to be safe.
    if (!slPlaced || !tpPlaced) {
      await cancelAllOpenOrders(symbol);
    }
  }

  // Now place fresh TP/SL
  if (sl !== null && !slPlaced) {
    const isValidSl = exitSide === "SELL" ? sl < markPrice : sl > markPrice;
    if (isValidSl) {
      await placeExitOrder(symbol, exitSide, "STOP_MARKET", sl);
    } else {
      log(
        "⚠ Provided SL " +
          sl +
          " is invalid against mark price " +
          markPrice +
          ". Skipping SL.",
      );
    }
  }

  if (tp !== null && !tpPlaced) {
    const isValidTp = exitSide === "SELL" ? tp > markPrice : tp < markPrice;
    if (isValidTp) {
      await placeExitOrder(symbol, exitSide, "TAKE_PROFIT_MARKET", tp);
    } else {
      log(
        "⚠ Provided TP " +
          tp +
          " is invalid against mark price " +
          markPrice +
          ". Skipping TP.",
      );
    }
  }
}

export interface DecisionRecord {
  timestamp: string;
  ticker: string;
  decision: string;
  reason: string;
  tp: number | null;
  sl: number | null;
  markPrice: number;
  unRealizedProfit: number;
  actionTaken: string;
}

function saveDecisionLog(record: DecisionRecord) {
  if (DRY_RUN) return;
  let records: DecisionRecord[] = [];
  try {
    if (fs.existsSync(DECISIONS_FILE)) {
      records = JSON.parse(fs.readFileSync(DECISIONS_FILE, "utf-8"));
    }
  } catch (err) {
    log("⚠ Could not read decisions db: " + String(err));
  }
  records.push(record);
  try {
    const dir = path.dirname(DECISIONS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DECISIONS_FILE, JSON.stringify(records, null, 2), "utf-8");
  } catch (err) {
    log("⚠ Could not writing to decisions db: " + String(err));
  }
}

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

  let finalDecision = decision;
  if (decision === "BUY" && isLong) {
    log("Already LONG – decision treated as HODL.");
    finalDecision = "HODL";
  } else if (decision === "SELL" && isShort) {
    log("Already SHORT – decision treated as HODL.");
    finalDecision = "HODL";
  }

  let actionTaken = finalDecision;

  if (finalDecision !== "HODL") {
    // Set leverage first
    await setLeverage(symbol, LEVERAGE);

    if (finalDecision === "BUY") {
      if (isShort) {
        log("Closing existing SHORT before going LONG...");
        await placeMarket(symbol, "BUY", Math.abs(posAmt), true);
        await cancelAllOpenOrders(symbol);
      }

      const price = await getMarkPrice(symbol);
      const availableUsdt = await getUsdtBalance();
      // Use 98% of available margin to avoid "Insufficient Margin" due to fees or slight price moves
      const tradeAmount = availableUsdt * 0.98;
      if (tradeAmount < 5)
        throw new Error("Available USDT too low: " + availableUsdt.toFixed(2));
      const qty = calcQty(tradeAmount, LEVERAGE, price);
      if (qty < 0.001) throw new Error("Calculated quantity too small: " + qty);

      log(
        "Opening LONG " +
          qty +
          " " +
          symbol +
          " @ ~" +
          price.toFixed(2) +
          " (" +
          LEVERAGE +
          "x, margin ~" +
          tradeAmount.toFixed(2) +
          " USDT)",
      );
      await placeMarket(symbol, "BUY", qty);
    } else if (finalDecision === "SELL") {
      if (isLong) {
        log("Closing existing LONG before going SHORT...");
        await placeMarket(symbol, "SELL", Math.abs(posAmt), true);
        await cancelAllOpenOrders(symbol);
      }

      const price = await getMarkPrice(symbol);
      const availableUsdt = await getUsdtBalance();
      // Use 98% of available margin to avoid "Insufficient Margin" due to fees or slight price moves
      const tradeAmount = availableUsdt * 0.98;
      if (tradeAmount < 5)
        throw new Error("Available USDT too low: " + availableUsdt.toFixed(2));
      const qty = calcQty(tradeAmount, LEVERAGE, price);
      if (qty < 0.001) throw new Error("Calculated quantity too small: " + qty);

      log(
        "Opening SHORT " +
          qty +
          " " +
          symbol +
          " @ ~" +
          price.toFixed(2) +
          " (" +
          LEVERAGE +
          "x, margin ~" +
          tradeAmount.toFixed(2) +
          " USDT)",
      );
      await placeMarket(symbol, "SELL", qty);
    }
  } else {
    log("Decision is HODL – checking existing position for TP/SL updates...");
  }

  // After potentially entering/exiting, refetch position risk to see if we have an active position
  const finalPos = await getPositionRisk(symbol);
  const finalIsLong = finalPos.positionAmt > 0.0009;
  const finalIsShort = finalPos.positionAmt < -0.0009;

  if (finalIsLong || finalIsShort) {
    // We have a position running. Place TP/SL if missing.
    const exitSide = finalIsLong ? "SELL" : "BUY";
    await ensureTpSl(symbol, exitSide, tp, sl, finalPos.markPrice);
  } else {
    // Flattened or no position. Clean up orders.
    log("No active position remaining. Cancelling any open orders.");
    await cancelAllOpenOrders(symbol);
  }

  saveDecisionLog({
    timestamp: new Date().toISOString(),
    ticker: symbol,
    decision,
    reason: decisionOut.reason,
    tp,
    sl,
    markPrice: finalPos.markPrice,
    unRealizedProfit: finalPos.unRealizedProfit,
    actionTaken,
  });
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
      "x  tradeUsdt=ALL_AVAILABLE",
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
