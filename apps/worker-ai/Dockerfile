# =============================================================================
# D'Vantage — AI Worker Dockerfile
# apps/worker-ai/Dockerfile
# =============================================================================

# -- Stage 0: base ------------------------------------------------------------
FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate


# -- Stage 1: install ---------------------------------------------------------
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

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile


# -- Stage 2: builder ---------------------------------------------------------
FROM install AS builder
WORKDIR /repo

COPY . .

# 1. Build all workspace package dependencies first
RUN pnpm turbo run build --filter=@vantage/worker-ai... --no-daemon

# 2. Build the worker using tsconfig.build.json so rootDir="src"
#    and output lands at apps/worker-ai/dist/main.js
RUN cd apps/worker-ai && npx tsc --project tsconfig.build.json

# 3. Verify the entry point exists
RUN test -f apps/worker-ai/dist/main.js || \
    (echo "ERROR: apps/worker-ai/dist/main.js not found" && ls -la apps/worker-ai/dist/ && exit 1)

# 4. Use pnpm deploy to create a self-contained production bundle
#    with correct node_modules (resolves workspace symlinks)
RUN pnpm --filter @vantage/worker-ai --prod deploy /standalone

# 5. Copy the compiled dist into the standalone bundle
RUN cp -r apps/worker-ai/dist /standalone/dist


# -- Stage 3: runner ----------------------------------------------------------
FROM node:20-alpine AS runner

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 vantage

WORKDIR /app

# Copy the self-contained standalone bundle (node_modules + dist + package.json)
COPY --from=builder --chown=vantage:nodejs /standalone ./

USER vantage

ENV NODE_ENV=production

CMD ["node", "dist/main.js"]
