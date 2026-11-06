FROM node:24-alpine AS base
# Keep in sync with "packageManager" in package.json.
RUN corepack enable && corepack prepare pnpm@12.11.2 --activate

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

# Build the application
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN pnpm prisma generate

# Build Next.js
ARG APP_VERSION=dev
ENV NEXT_PUBLIC_APP_VERSION=$APP_VERSION
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# Bundle standalone worker
RUN pnpm build:worker

# Add the worker's runtime files to the traced standalone output, so the
# image ships only what server.js and worker.mjs actually load.
RUN node scripts/trace-worker.mjs

# Prisma CLI for `migrate deploy` at startup, isolated from the app's traced
# node_modules (it pulls in ~250 MB the app itself never loads).
FROM node:24-alpine AS prisma-cli
WORKDIR /opt/prisma
COPY --from=builder /app/node_modules/prisma/package.json /tmp/prisma.json
COPY --from=builder /app/node_modules/dotenv/package.json /tmp/dotenv.json
RUN npm install --omit=dev --no-audit --no-fund \
      "prisma@$(node -p "require('/tmp/prisma.json').version")" \
      "dotenv@$(node -p "require('/tmp/dotenv.json').version")"
COPY prisma ./prisma
COPY prisma.config.ts ./

# Production image: plain Node, no pnpm/corepack/npm needed at runtime.
FROM node:24-alpine AS runner
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=prisma-cli /opt/prisma /opt/prisma

# Copy built assets
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/worker.mjs ./worker.mjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --chmod=755 docker-entrypoint.sh ./docker-entrypoint.sh

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["./docker-entrypoint.sh"]
