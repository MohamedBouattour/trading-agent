# Deployment & Operations Scripts

## 1. Trading Bot (Direct Cronjob)

The bot now runs as a standalone Node.js script via a system cronjob on your VPS, completely bypassing Docker.

### Local Machine: Build

```bash
# Build the TypeScript bot into /dist/bot.cjs
npm run build:bot
```

### Server (Ubuntu): Setup

Ensure you have Node.js and the `results/` directory on your VPS.

**Add to Crontab (`crontab -e`):**

```bash
# Run every 4 hours
0 */4 * * * cd /home/ubuntu/bot && node services/trading-bot/dist/bot.cjs >> /home/ubuntu/bot/output.log 2>&1
```

---

## 2. Webapp (Standalone Docker)

The webapp remains a premium standalone container.

### Local Machine: Build & Push

```bash
# 1. Build the webapp image
docker build -t devmed555/trading-webapp:latest ./services/webapp

# 2. Push to Docker Hub
docker push devmed555/trading-webapp:latest
```

### Server (Ubuntu): Run

Ensure `docker-compose.webapp.yml` is on your VPS.

```bash
# 1. Pull the latest image
docker pull devmed555/trading-webapp:latest

# 2. Start the container
docker compose up -d --remove-orphans
```

---

## 3. Monitoring

### Bot Logs

```bash
tail -f /home/ubuntu/bot/output.log
```

### Webapp Logs

```bash
docker compose -f docker-compose.webapp.yml logs -f webapp
```
