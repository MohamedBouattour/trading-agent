# Deployment & Operations Scripts

This document outlines the standard commands to build the trading bot, push it to your registry, pull it on the Ubuntu server, run it, and monitor the logs.

## 1. Local Machine: Build & Push

_Avoid using `--no-cache` on daily builds to save time – Docker will skip re-downloading things that haven't changed._

```bash
# Set buildkit to make builds faster
$env:DOCKER_BUILDKIT=1

# Build the image using cache
docker build -t devmed555/trading-bot:latest .

# Push to your registry so the server can access it
docker push devmed555/trading-bot:latest
```

## 2. Server (Ubuntu): Pull & Deploy

_Run these commands on your VPS (`ssh ubuntu@79.137.14.75`). Make sure you are in the `/home/ubuntu/TradingAgents` directory where your `docker-compose.yml` lives._

```bash
# Pull the latest changes from Docker Hub
docker pull devmed555/trading-bot:latest

# Restart the container in the background to apply the new image
docker compose up -d
```

## 3. Server: Monitor Logs

Once the container is running, use these commands to ensure it's executing tasks successfully:

**Option A: View the raw output from bot.ts (Best for checking signals)**
The bot writes an organized log into the mounted `logs/` directory.

```bash
tail -f logs/bot.log
```

**Option B: View Docker container stdout logs**
This shows the entrypoint logs and standard JS output.

```bash
docker compose logs -f trading-bot
```

## Useful Commands

- **Stop the bot:** `docker compose down`
- **Restart the bot:** `docker compose restart`
- **Check if the container is running:** `docker ps`
