FROM node:22-slim AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

RUN pnpm config set registry-enable-ipv6 false

COPY package.json ./

# Try to use lockfile if exists, else install
COPY pnpm-lock.yaml* ./

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install

COPY . .

FROM node:22-slim AS runner

RUN apt-get update && apt-get install -y cron tzdata ca-certificates bash && rm -rf /var/lib/apt/lists/*
RUN npm install -g tsx pnpm

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/src ./src

RUN mkdir -p /app/results /app/logs

RUN echo "* * * * * root . /etc/environment && cd /app && npx tsx src/bot.ts >> /app/logs/bot.log 2>&1" > /etc/cron.d/bot-cron \
    && chmod 0644 /etc/cron.d/bot-cron \
    && crontab /etc/cron.d/bot-cron

ENV TICKER=BTCUSDT
ENV LEVERAGE=5
ENV TRADE_USDT=100
ENV RESULTS_DIR=/app/results
ENV LOG_FILE=/app/logs/bot.log
ENV TZ=UTC
ENV NODE_ENV=production

COPY <<'EOF' /app/entrypoint.sh
#!/bin/bash
set -e
echo "[entrypoint] Starting TradingBot container at $(date -u)"
echo "[entrypoint] TICKER=$TICKER  LEVERAGE=${LEVERAGE}x  TRADE_USDT=$TRADE_USDT  DRY_RUN=${DRY_RUN:-false}"

env >> /etc/environment

echo "[entrypoint] Running initial decision..."
cd /app && npx tsx src/bot.ts >> /app/logs/bot.log 2>&1 || true
echo "[entrypoint] Starting cron..."
exec cron -f
EOF

RUN sed -i 's/\r$//' /app/entrypoint.sh && chmod +x /app/entrypoint.sh

ENTRYPOINT ["/app/entrypoint.sh"]
