#!/usr/bin/env tsx
/**
 * Decision-Maker – standalone script
 *
 * Usage:
 *   pnpm run decide [TICKER] [DATE]
 *   pnpm tsx src/decision-maker/decision-maker.ts BTCUSDT 2026-03-14
 *
 * Reads results/{TICKER}/{DATE}_state.json, fetches the latest 500 1h candles
 * from Binance (with EMA9/21, RSI14, candlestick pattern labels per row),
 * then asks Gemini for a BUY / SELL / HODL decision.
 *
 * If the state file's date is > 7 days old the full analyse CLI is run first.
 */

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import { spawn } from "node:child_process";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage } from "@langchain/core/messages";

// ─── Config ──────────────────────────────────────────────────────────────────

const TICKER = process.argv[2] ?? "BTCUSDT";
const DATE_ARG = process.argv[3] ?? new Date().toISOString().split("T")[0];
const RESULTS_DIR = process.env.RESULTS_DIR ?? "./results";
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const MODEL = process.env.QUICK_THINK_MODEL ?? "gemini-2.5-flash";
const STALE_DAYS = 7;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dateFromFilename(filename: string): Date {
  const match = path.basename(filename).match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match) throw new Error("Cannot parse date from filename: " + filename);
  return new Date(match[1]);
}

function daysDiff(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function get(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

function runAnalyseCLI(): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(
      "\n⚠  State file is stale (>7 days). Running the analyse pipeline...\n",
    );
    const child = spawn(
      "pnpm",
      ["tsx", "src/cli/main.ts", "--ticker", TICKER, "--date", DATE_ARG],
      { stdio: "inherit", shell: true, cwd: process.cwd() },
    );
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error("Analyse CLI exited with code " + code));
    });
  });
}

// ─── Binance candles ──────────────────────────────────────────────────────────

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
  const raw = await get(url);
  const rows: any[][] = JSON.parse(raw);
  return rows.map((r) => ({
    openTime: r[0],
    open: r[1],
    high: r[2],
    low: r[3],
    close: r[4],
    volume: r[5],
    closeTime: r[6],
  }));
}

// ─── Technical indicator helpers ──────────────────────────────────────────────

function calcEma(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result: number[] = [];
  let prev = 0;
  let seeded = false;
  let seedCount = 0;
  let seedSum = 0;
  for (let i = 0; i < values.length; i++) {
    if (!seeded) {
      seedSum += values[i];
      seedCount++;
      if (seedCount === period) {
        prev = seedSum / period;
        seeded = true;
        result.push(prev);
      } else {
        result.push(NaN);
      }
    } else {
      prev = values[i] * k + prev * (1 - k);
      result.push(prev);
    }
  }
  return result;
}

function calcRsi(closes: number[], period = 14): number[] {
  const result: number[] = new Array(period).fill(NaN);
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) avgGain += d;
    else avgLoss += Math.abs(d);
  }
  avgGain /= period;
  avgLoss /= period;
  result.push(100 - 100 / (1 + avgGain / (avgLoss || 1e-10)));
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const gain = d > 0 ? d : 0;
    const loss = d < 0 ? Math.abs(d) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result.push(100 - 100 / (1 + avgGain / (avgLoss || 1e-10)));
  }
  return result;
}

function calcVwap(candles: Candle[]): number {
  let sumPV = 0;
  let sumV = 0;
  for (const c of candles) {
    const tp =
      (parseFloat(c.high) + parseFloat(c.low) + parseFloat(c.close)) / 3;
    const v = parseFloat(c.volume);
    sumPV += tp * v;
    sumV += v;
  }
  return sumPV / (sumV || 1);
}

function detectPattern(c: Candle): string {
  const o = parseFloat(c.open);
  const h = parseFloat(c.high);
  const l = parseFloat(c.low);
  const cl = parseFloat(c.close);
  const body = Math.abs(cl - o);
  const range = h - l || 1e-10;
  const upperWick = h - Math.max(o, cl);
  const lowerWick = Math.min(o, cl) - l;
  const bodyRatio = body / range;
  if (bodyRatio < 0.1) return "doji";
  if (lowerWick > body * 2 && upperWick < body * 0.3)
    return cl > o ? "hammer" : "inv-hammer";
  if (upperWick > body * 2 && lowerWick < body * 0.3)
    return cl < o ? "shooting-star" : "hanging-man";
  if (bodyRatio > 0.7) return cl > o ? "bull-marubozu" : "bear-marubozu";
  return "";
}

// ─── Build rich candle section for prompt ─────────────────────────────────────

function buildCandleSection(candles: Candle[]): string {
  if (candles.length === 0) return "No candle data available.";

  const closes = candles.map((c) => parseFloat(c.close));
  const highs = candles.map((c) => parseFloat(c.high));
  const lows = candles.map((c) => parseFloat(c.low));
  const volumes = candles.map((c) => parseFloat(c.volume));

  const ema9arr = calcEma(closes, 9);
  const ema21arr = calcEma(closes, 21);
  const rsiArr = calcRsi(closes, 14);
  const vwapVal = calcVwap(candles);

  const first = candles[0];
  const last = candles[candles.length - 1];
  const periodHigh = Math.max(...highs);
  const periodLow = Math.min(...lows);
  const avgVol = volumes.reduce((a, b) => a + b, 0) / volumes.length;
  const vol20Avg = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const pct = (
    ((parseFloat(last.close) - parseFloat(first.open)) /
      parseFloat(first.open)) *
    100
  ).toFixed(2);

  // Bull/bear candle count in recent 20
  const recent = candles.slice(-20);
  const upCount = recent.filter(
    (c) => parseFloat(c.close) > parseFloat(c.open),
  ).length;

  const curEma9 = ema9arr[ema9arr.length - 1];
  const curEma21 = ema21arr[ema21arr.length - 1];
  const curRsi = rsiArr[rsiArr.length - 1];

  const stats = [
    "=== PERIOD STATISTICS ===",
    "Period : " +
      new Date(first.openTime).toISOString() +
      " to " +
      new Date(last.closeTime).toISOString(),
    "Candles: " + candles.length + " x 1h",
    "First Open   : " + parseFloat(first.open).toFixed(2),
    "Latest Close : " + parseFloat(last.close).toFixed(2),
    "Period High  : " + periodHigh.toFixed(2),
    "Period Low   : " + periodLow.toFixed(2),
    "Price Change : " + pct + "%",
    "VWAP (whole period)  : " + vwapVal.toFixed(2),
    "EMA9  (latest) : " + (isNaN(curEma9) ? "N/A" : curEma9.toFixed(2)),
    "EMA21 (latest) : " + (isNaN(curEma21) ? "N/A" : curEma21.toFixed(2)),
    "RSI14 (latest) : " + (isNaN(curRsi) ? "N/A" : curRsi.toFixed(2)),
    "Avg Volume (500h) : " + avgVol.toFixed(2),
    "Avg Volume (last 20h) : " +
      vol20Avg.toFixed(2) +
      " [" +
      (vol20Avg > avgVol
        ? "ABOVE AVG - rising interest"
        : "BELOW AVG - fading interest") +
      "]",
    "Bull candles (last 20) : " + upCount + "/20",
    "",
    "=== FULL OHLCV + INDICATORS (all 500 candles, newest last) ===",
    "Columns: timestamp(UTC),open,high,low,close,volume,ema9,ema21,rsi14,pattern",
    "NOTE: Use this data to spot: EMA crossovers, RSI divergence, volume spikes,",
    "      candlestick reversal patterns (doji, hammer, shooting-star, marubozu).",
  ].join("\n");

  // Build all rows
  const rows = candles.map((c, i) => {
    const ts = new Date(c.openTime).toISOString().slice(0, 16);
    const o = parseFloat(c.open).toFixed(2);
    const h = parseFloat(c.high).toFixed(2);
    const l = parseFloat(c.low).toFixed(2);
    const cl = parseFloat(c.close).toFixed(2);
    const vol = parseFloat(c.volume).toFixed(2);
    const e9 = isNaN(ema9arr[i]) ? "" : ema9arr[i].toFixed(2);
    const e21 = isNaN(ema21arr[i]) ? "" : ema21arr[i].toFixed(2);
    const r = isNaN(rsiArr[i]) ? "" : rsiArr[i].toFixed(1);
    const pat = detectPattern(c);
    return [ts, o, h, l, cl, vol, e9, e21, r, pat].join(",");
  });

  return stats + "\n" + rows.join("\n");
}

// ─── Gemini decision ──────────────────────────────────────────────────────────

async function askGemini(
  state: Record<string, any>,
  candles: Candle[],
): Promise<string> {
  const model = new ChatGoogleGenerativeAI({
    model: MODEL,
    temperature: 0.2,
    maxRetries: 3,
    apiKey: GOOGLE_API_KEY,
  });

  const candleSection = buildCandleSection(candles);

  const parts: string[] = [
    "You are an expert crypto trading decision engine.",
    "",
    "You will receive:",
    "1. A comprehensive multi-agent analysis report for " +
      TICKER +
      " (date: " +
      DATE_ARG +
      ").",
    "2. Full OHLCV candle data for the latest 500 one-hour Binance candles,",
    "   with pre-computed EMA9, EMA21, RSI14 and candlestick pattern label per row.",
    "",
    "Your job: synthesise ALL information and output EXACTLY ONE WORD — BUY, SELL, or HODL.",
    "No punctuation. No explanation. Just the single word.",
    "",
    "When analysing the candle data look for:",
    "- EMA9 / EMA21 crossovers (bullish cross = EMA9 > EMA21, bearish = EMA9 < EMA21)",
    "- RSI divergence or extreme readings (<30 oversold / >70 overbought)",
    "- Volume spikes relative to the 500h and 20h averages",
    "- Candlestick reversal patterns at key price levels",
    "- Momentum (consecutive bull/bear candles, shrinking bodies, expanding wicks)",
    "",
    "---",
    "## MULTI-AGENT ANALYSIS REPORT",
    "",
    "### Market Analysis",
    state.marketReport ?? "N/A",
    "",
    "### Sentiment Analysis",
    state.sentimentReport ?? "N/A",
    "",
    "### News Analysis",
    state.newsReport ?? "N/A",
    "",
    "### Fundamentals Analysis",
    state.fundamentalsReport ?? "N/A",
    "",
    "### Investment Plan",
    state.investmentPlan ?? "N/A",
    "",
    "### Final Trade Decision (previous pipeline run)",
    state.finalTradeDecision ?? "N/A",
    "",
    "---",
    "## LIVE BINANCE CANDLE DATA (500 x 1h)",
    "",
    candleSection,
    "",
    "---",
    "Based on ALL the above, respond with exactly one word: BUY, SELL, or HODL.",
  ];

  const prompt = parts.join("\n");
  const response = await model.invoke([new HumanMessage(prompt)]);
  const text =
    typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);

  const match = text.match(/\b(BUY|SELL|HODL)\b/i);
  if (!match) {
    console.warn("⚠  Could not parse decision from model output:", text);
    return "HODL";
  }
  return match[1].toUpperCase();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const BANNER = [
    "",
    "  ██████╗ ███████╗ ██████╗██╗███████╗██╗ ██████╗ ███╗  ██╗",
    "  ██╔══██╗██╔════╝██╔════╝██║██╔════╝██║██╔═══██╗████╗ ██║",
    "  ██║  ██║█████╗  ██║     ██║███████╗██║██║   ██║██╔██╗██║",
    "  ██║  ██║██╔══╝  ██║     ██║╚════██║██║██║   ██║██║╚████║",
    "  ██████╔╝███████╗╚██████╗██║███████║██║╚██████╔╝██║ ╚███║",
    "  ╚═════╝ ╚══════╝ ╚═════╝╚═╝╚══════╝╚═╝ ╚═════╝ ╚═╝  ╚══╝",
    "           M A K E R   ·   " + TICKER + "  ·  " + DATE_ARG,
    "",
  ].join("\n");
  console.log(BANNER);

  // 1. Resolve state file path
  const stateFilePath = path.resolve(
    RESULTS_DIR,
    TICKER,
    DATE_ARG + "_state.json",
  );

  // 2. Staleness check
  if (fs.existsSync(stateFilePath)) {
    const fileDate = dateFromFilename(stateFilePath);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const age = daysDiff(fileDate, today);
    if (age > STALE_DAYS) {
      await runAnalyseCLI();
    } else {
      console.log(
        "✓ State file is fresh (" +
          age +
          " day" +
          (age !== 1 ? "s" : "") +
          " old): " +
          stateFilePath +
          "\n",
      );
    }
  } else {
    console.log("✗ State file not found: " + stateFilePath);
    await runAnalyseCLI();
  }

  // 3. Read state JSON
  let state: Record<string, any>;
  try {
    const raw = fs.readFileSync(stateFilePath, "utf-8");
    state = JSON.parse(raw);
  } catch (err: any) {
    throw new Error("Failed to read state file: " + err.message);
  }
  console.log("✓ Loaded analysis state from " + stateFilePath);

  // 4. Fetch Binance candles
  console.log("► Fetching latest 500 × 1h candles for " + TICKER + "...");
  const candles = await fetchCandles(TICKER);
  const lastClose = candles[candles.length - 1]?.close ?? "?";
  console.log(
    "✓ " +
      candles.length +
      " candles fetched  |  Latest close: " +
      lastClose +
      "\n",
  );

  // 5. Ask Gemini
  console.log("► Asking Gemini (" + MODEL + ") for a decision...");
  const decision = await askGemini(state, candles);

  // 6. Print result
  const border = "═".repeat(40);
  console.log("\n" + border);
  console.log("  🤖  DECISION: " + decision);
  console.log(border + "\n");
}

main().catch((err) => {
  console.error("\n✖ Fatal error:", err.message ?? err);
  process.exit(1);
});
