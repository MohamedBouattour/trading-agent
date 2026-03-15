FROM node:22-slim AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

RUN pnpm config set registry-enable-ipv6 false

COPY package.json ./
# Try to use lockfile if exists
COPY pnpm-lock.yaml* ./

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install

COPY . .

WORKDIR /app
RUN pnpm build

FROM node:22-slim AS runner

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/src ./src

# Example entrypoint for running the CLI analyzer manually
ENTRYPOINT ["npx", "tsx", "src/cli/main.ts"]
