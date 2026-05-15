FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

FROM base AS install
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json          ./apps/api/package.json
COPY apps/worker-ai/package.json    ./apps/worker-ai/package.json
COPY packages/ai/package.json         ./packages/ai/package.json
COPY packages/config/package.json     ./packages/config/package.json
COPY packages/contracts/package.json  ./packages/contracts/package.json
COPY packages/database/package.json   ./packages/database/package.json
COPY packages/domain/package.json     ./packages/domain/package.json
COPY packages/events/package.json     ./packages/events/package.json
COPY packages/parsing/package.json    ./packages/parsing/package.json
COPY packages/queue/package.json      ./packages/queue/package.json
COPY packages/validation/package.json ./packages/validation/package.json
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile

FROM install AS builder
WORKDIR /repo
COPY . .
RUN pnpm --filter "@vantage/api..." run build
RUN test -f apps/api/dist/main.js || (echo "ERROR: apps/api/dist/main.js not found" && exit 1)

FROM node:20-alpine AS runner
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 vantage
WORKDIR /repo
COPY --from=builder --chown=vantage:nodejs /repo /repo
USER vantage
ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "require('http').get('http://localhost:3001/health',function(r){process.exit(r.statusCode===200?0:1)}).on('error',function(){process.exit(1)});"
WORKDIR /repo/apps/api
CMD ["node", "dist/main.js"]
