import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

export const ConfigSchema = z.object({
  llmProvider: z.string().default("openrouter"),
  openrouterApiKey: z.string().optional(),
  deepThinkModel: z.string().default("nvidia/nemotron-3-nano-30b-a3b:free"),
  quickThinkModel: z.string().default("nvidia/nemotron-3-nano-30b-a3b:free"),
  embeddingModel: z.string().default("nvidia/nemotron-3-nano-30b-a3b:free"),
  binanceApiKey: z.string().optional(),
  binanceApiSecret: z.string().optional(),
  maxDebateRounds: z.coerce.number().default(1),
  maxRiskRounds: z.coerce.number().default(1),
  resultsDir: z.string().default("./results"),
  rateLimitDelayMs: z.coerce.number().default(3000),
  googleApiKey: z.string().optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

export const loadConfig = (): Config => {
  return ConfigSchema.parse({
    llmProvider: process.env.LLM_PROVIDER,
    openrouterApiKey: process.env.OPENROUTER_API_KEY,
    deepThinkModel: process.env.DEEP_THINK_MODEL,
    quickThinkModel: process.env.QUICK_THINK_MODEL,
    embeddingModel: process.env.EMBEDDING_MODEL,
    binanceApiKey: process.env.BINANCE_API_KEY,
    binanceApiSecret: process.env.BINANCE_API_SECRET,
    maxDebateRounds: process.env.MAX_DEBATE_ROUNDS,
    maxRiskRounds: process.env.MAX_RISK_DISCUSS_ROUNDS,
    resultsDir: process.env.RESULTS_DIR,
    rateLimitDelayMs: process.env.RATE_LIMIT_DELAY_MS,
    googleApiKey: process.env.GOOGLE_API_KEY,
  });
};
