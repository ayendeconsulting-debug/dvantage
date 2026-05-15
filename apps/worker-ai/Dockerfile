# =============================================================================
# D'Vantage — AI Worker Dockerfile
# apps/worker-ai/Dockerfile
#
# Identical multi-stage pattern to the API Dockerfile.
# Key differences:
#   - filter targets @vantage/worker-ai
#   - no EXPOSE / no HEALTHCHECK (worker has no HTTP server)
#   - min_machines_running = 0 on Fly (scales to zero between jobs)
# =============================================================================

# ── Stage 0: base ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate


# ── Stage 1: install ──────────────────────────────────────────────────────────
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


# ── Stage 2: builder ──────────────────────────────────────────────────────────
FROM install AS builder
WORKDIR /repo

COPY . .

# Builds worker-ai and all its workspace deps (ai, database, parsing, queue…)
RUN pnpm turbo run build --filter=@vantage/worker-ai... --no-daemon


# ── Stage 3: deploy ───────────────────────────────────────────────────────────
FROM base AS deploy
WORKDIR /repo

COPY --from=builder /repo ./

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter @vantage/worker-ai --prod deploy /standalone


# ── Stage 4: runner ───────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 vantage

WORKDIR /app

COPY --from=deploy --chown=vantage:nodejs /standalone ./

USER vantage

ENV NODE_ENV=production

# Worker has no HTTP server — no EXPOSE, no HEALTHCHECK
# Fly monitors the process directly (exit code signals failure)

CMD ["node", "dist/main.js"]
