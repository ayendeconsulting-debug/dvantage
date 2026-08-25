# Session Handover — D'Vantage

**Project:** D'Vantage — AI Resume Intelligence & Autonomous Job Application Platform
**Handover date:** 13 May 2026
**Phase:** Milestone 0 complete. Ready to start Milestone 1 — Identity & Auth.

---

## How to use this handover

You are a new Claude session resuming an enterprise-grade engineering engagement. Every decision in this document was deliberated and explicitly approved by the user. Do not re-litigate any locked decision. If something feels suboptimal, raise it — do not silently change it.

---

## Workflow rules (binding for every interaction)

1. **Enterprise-grade only.** Build as a 0.001 percentile engineer would. No shortcuts.
2. **Clarify before coding.** Every requirement must be understood before a single line is written.
3. **Approval before code.** Always present a plan and obtain explicit user approval before implementation.
   3a. **Corrections require confirmation.** When making a correction, confirm the user's understanding before coding.
4. **Inspect existing files first.** Before writing or modifying, view existing files to understand structure and dependencies.
5. **Validate TypeScript before deployment.** No deploys with type errors.
6. **File delivery via downloads + PowerShell.** User is on Windows with PowerShell. All file delivery commands must use PowerShell syntax. Use `Expand-Archive`, `Copy-Item`, `New-Item` etc. Never bash/mv/tar commands.
7. **Modal-based decisions.** When asking the user to choose between options, present them as a tappable modal. Always leave room for additional input.

---

## Brand

### Name

- **Product name:** D'Vantage _(was "Vantage" — renamed this session due to trademark conflicts)_
- **Internal package scope:** `@vantage/*` _(kept — internal detail, not user-facing)_
- **Tagline:** From applied to interview. _(always lowercase except leading F, always terminal period)_
- **Archetype:** The Magician — make hidden potential visible
- **Theme:** Atlas — modern minimal, electric blue

### Logo (LOCKED — approved 13 May 2026)

**Mark:**

- Path: `M 2 20 L 11 4 L 30 20`
- ViewBox: 32×24
- Stroke: 3, `strokeLinecap: square`, `strokeLinejoin: miter`
- Colour: brand-500 `#3B82F6`

**Wordmark (single element, no gaps between segments):**

- `D` — Outfit weight 900, `#3B82F6` (matches mark, brand-500)
- `'` — Outfit weight 200, white
- `vant` — Outfit weight 900, white
- `age` — Outfit weight 200, `#60A5FA` (brand-400, one step lighter)

**Component:** `apps/web/src/components/logo/dvantage-logo.tsx` → `DVantageLogo`

### Color tokens (Atlas)

```
brand-500:    #3B82F6   // primary blue, mark, D
brand-400:    #60A5FA   // age in wordmark, accents
brand-600:    #2563EB

surface-base: #050505   // page background
surface-1:    #0A0A0A   // cards
surface-2:    #141414   // modal, raised
surface-3:    #1F1F1F   // borders, dividers
surface-4:    #2A2A2A   // hover state

text-primary:   #FFFFFF
text-body:      #D4D4D8
text-secondary: #A1A1AA
text-muted:     #71717A
text-disabled:  #52525B

status-success: #10B981
status-danger:  #EF4444
status-warning: #F59E0B
status-info:    #3B82F6
```

### Typography

- **Display:** Outfit (weights 200, 500, 600, 700, 900)
- **Body:** DM Sans (weights 400, 500)
- **Mono:** Geist Mono (weights 400, 500)

---

## Locked tech stack

### Runtime & data

- **Backend:** NestJS + TypeScript (modular monolith, multi-process)
- **Database:** PostgreSQL 16 + pgvector
- **Queue:** Redis 7 + BullMQ
- **Frontend:** Next.js 15 + TypeScript

### Infrastructure & hosting

- **Backend hosting:** Fly.io
- **Frontend hosting:** Vercel Pro
- **CDN / WAF / DNS:** Cloudflare
- **Object storage:** Cloudflare R2 (MinIO locally)
- **Encryption keys:** AWS KMS

### Application services

- **AI providers:** OpenAI + Anthropic via Vercel AI SDK + custom `AIService` wrapper
- **Payments:** Stripe (Checkout + Customer Portal + webhooks)
- **Email:** Resend
- **Feature flags:** Statsig
- **Secrets:** Doppler
- **Auth:** better-auth

### Observability

- **Errors:** Sentry
- **Logs/metrics/traces:** Grafana Cloud (LGTM) via OpenTelemetry

### Dev operations

- **CI/CD:** GitHub Actions with OIDC
- **IaC:** Pulumi (TypeScript) for AWS KMS + Cloudflare R2
- **Local dev:** Docker Compose (Postgres+pgvector, Redis, Mailpit, MinIO)

---

## Monorepo structure

```
vantage/                          ← repo root (named "vantage")
├── apps/
│   ├── api/                      # NestJS HTTP API — port 3001
│   ├── worker-ai/                # AI generation processor
│   ├── worker-scraper/           # Job aggregation (Phase 2)
│   ├── worker-automation/        # Browserbase orchestrator (Phase 3)
│   ├── worker-inbox/             # Gmail/Outlook poller (Phase 4)
│   ├── worker-scheduler/         # Cron triggers
│   └── web/                      # Next.js frontend — port 3000
├── packages/
│   ├── contracts/                # API DTOs, error codes, entitlements
│   ├── domain/                   # Value objects (Money, ATSScore)
│   ├── validation/               # Zod schemas (shared front/back)
│   ├── database/                 # Drizzle schema, migrations, client
│   ├── ai/                       # Provider abstraction (stub — M3)
│   ├── ui-kit/                   # Atlas tokens + components
│   ├── events/                   # Domain event types
│   ├── queue/                    # BullMQ queue names + connection
│   └── config/                   # Env validation schemas
├── infra/
│   ├── fly/                      # fly.toml stubs
│   └── pulumi/                   # KMS + R2 provisioning
├── scripts/
│   ├── docker/init-postgres.sql  # pgvector + extensions init
│   └── dev-setup.ps1             # One-command local env setup
├── .env                          # Local dev values (not committed)
├── .env.example                  # Documents all required vars
├── docker-compose.yml            # Local services
├── turbo.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

---

## Critical technical decisions made during M0 implementation

These are NOT in the requirements doc — they were resolved during build. Every future session must respect them.

### 1. All packages use CommonJS (NOT ESM)

**Decision:** All `packages/*` use `module: CommonJS, moduleResolution: Node`. `"type": "module"` removed from all package `package.json` files. `.js` extensions stripped from all intra-package imports.

**Reason:** The API runs in CommonJS via `ts-node`. When packages had `"type": "module"`, `ts-node`'s CJS `require()` threw `ERR_REQUIRE_ESM`. Converting to CJS resolved this cleanly.

**Impact:** All new packages must NOT have `"type": "module"`. All intra-package imports must NOT use `.js` extensions.

### 2. API dev toolchain: ts-node + @swc/core + nodemon

**Decision:** `pnpm dev` in `apps/api` uses `nodemon` → `ts-node -r dotenv/config src/main.ts`.

**Reason:** `nest start --watch` compiles to `dist/` but without `rootDir` the output path shifts to `dist/apps/api/src/main.js`. `ts-node` runs TypeScript directly, resolving workspace packages to their `.ts` source via `tsconfig-paths`.

**Config:** `apps/api/tsconfig.json` has `"ts-node"` block with `swc: true, transpileOnly: true, require: ["tsconfig-paths/register"]`.

**Env loading:** `nodemon.json` sets `DOTENV_CONFIG_PATH: "../../.env"` and exec uses `-r dotenv/config`. This loads `.env` from repo root automatically on every start.

### 3. API tsconfig has no rootDir

**Decision:** `rootDir` removed from `apps/api/tsconfig.json`.

**Reason:** When `paths` resolve workspace packages to `../../packages/*/src/index.ts`, TypeScript enforces that those files are under `rootDir`. Removing `rootDir` fixes the "not under rootDir" typecheck errors. `ts-node` handles compilation at runtime; `tsc --noEmit` (typecheck) doesn't need a strict rootDir.

### 4. OpenTelemetry: env-var auto-detection only

**Decision:** `otel.ts` uses `NodeSDK` without an explicit `traceExporter`. The SDK reads `OTEL_EXPORTER_OTLP_ENDPOINT` from the environment automatically.

**Reason:** `@opentelemetry/exporter-trace-otlp-grpc@0.56` had a type mismatch with `SpanExporter` from `sdk-node@0.53`. Removing the explicit exporter resolves this and is the recommended pattern anyway.

### 5. @fastify/static must be pinned to ^6.0.0

**Decision:** `apps/api` depends on `@fastify/static@^6.0.0`, NOT latest.

**Reason:** `@fastify/static@9+` requires Fastify v5. We use Fastify v4 (required by `@nestjs/platform-fastify@10`). v6 is the correct version for Fastify v4.

### 6. .env populated with local Docker values

The `.env` file at repo root (created from `.env.example` by `dev-setup.ps1`) contains:

```
DATABASE_URL=postgresql://vantage:vantage@localhost:5432/vantage
REDIS_URL=redis://localhost:6379
APP_URL=http://localhost:3000
API_URL=http://localhost:3001
R2_ENDPOINT=http://localhost:9000
R2_ACCESS_KEY_ID=minioadmin
R2_SECRET_ACCESS_KEY=minioadmin
R2_PUBLIC_URL=http://localhost:9000
R2_BUCKET_RESUMES=vantage-resumes-dev
R2_BUCKET_EXPORTS=vantage-exports-dev
```

All other vars (API keys, Stripe, etc.) are empty placeholders — not needed until M3-M4.

### 7. NodeJS.ProcessEnv → Record<string, string | undefined>

**Decision:** All `parseXxxEnv()` functions in `packages/config/src/env/` accept `Record<string, string | undefined>` instead of `NodeJS.ProcessEnv`.

**Reason:** `packages/config` has no `@types/node` dependency. The `NodeJS` namespace was unavailable. The native type is identical and requires no additional dependency.

### 8. IORedis import

**Decision:** `import { Redis } from 'ioredis'` (named import), NOT `import IORedis from 'ioredis'` (default import).

**Reason:** ioredis v5 does not expose a constructable default export. The named `Redis` class is the correct import.

---

## Milestone 0 — Complete ✅

| Sub-step                  | Status | Notes                                                          |
| ------------------------- | ------ | -------------------------------------------------------------- |
| M0-A Monorepo scaffold    | ✅     | 95 files, 9 packages, 7 apps, CI/CD, Pulumi, fly.toml          |
| M0-B Atlas design tokens  | ✅     | colors, typography, spacing, radius, motion + CSS variables    |
| M0-C Docker Compose       | ✅     | Postgres+pgvector, Redis, Mailpit, MinIO — all healthy         |
| M0-D NestJS API bootstrap | ✅     | GET /health → 200, DB + Redis connected, Swagger at :3001/docs |
| M0-E Next.js web shell    | ✅     | D'Vantage logo, Atlas theme, live at localhost:3000            |
| M0-F CI/CD scaffold       | ✅     | GitHub Actions pipelines in .github/workflows/                 |

---

## Locked conventions

### Database schema

- **PKs:** UUID v7 (time-ordered, no enumeration leak)
- **Naming:** snake_case columns, plural table names
- **Timestamps:** `created_at`, `updated_at` on every row
- **Soft delete:** `deleted_at` where appropriate
- **Audit columns:** `created_by`, `updated_by` on multi-actor entities
- **Foreign keys:** Always indexed; `ON DELETE` policy explicit
- **JSON:** `jsonb` only, never `json`
- **Money:** stored as integers (cents); wrapped in Money value object

### Error model: RFC 7807 Problem Details

- Typed error codes in `packages/contracts/src/errors/error-codes.ts`
- Internal exception hierarchy: `DomainException` vs `InfrastructureException`
- Global NestJS exception filter: `apps/api/src/common/filters/all-exceptions.filter.ts`

### API conventions

- Versioning: URL path (`/v1/...`); `/health` excluded from prefix
- Pagination: cursor-based (`?cursor=xxx&limit=20`)
- Idempotency: `Idempotency-Key` header required on mutations
- Response envelope: bare data on success, RFC 7807 on error
- Rate limit headers: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`
- Every request stamped with `X-Request-Id` (generated or echoed from client)

---

## Phase 1 MVP scope

1. ✅ Foundation (monorepo, infra, deployment)
2. ⬜ Auth (email/password, verification, password reset, MFA) ← **NEXT**
3. ⬜ Resume upload + parsing (PDF, DOCX, TXT)
4. ⬜ Job description input (paste or upload)
5. ⬜ ATS scoring engine (keyword + structure + semantic via pgvector)
6. ⬜ AI resume optimization
7. ⬜ Side-by-side comparison + diff view
8. ⬜ Resume export (PDF + DOCX)
9. ⬜ Stripe billing (Free vs Premium)
10. ⬜ Usage metering + entitlement enforcement
11. ⬜ Basic dashboard
12. ⬜ Manual application tracking

---

## Milestone 1 — Identity & Auth (Week 2)

**What gets built:**

- `better-auth` integration in `apps/api`
- Auth methods: email/password + Google OAuth + Microsoft OAuth
- Email verification, password reset flows
- MFA: TOTP (Google Authenticator compatible)
- Sessions: Redis-backed, HTTP-only Secure cookies, sliding 30-day expiry
- KMS envelope encryption for OAuth tokens
- Rate limiting on auth endpoints (Redis-backed `@nestjs/throttler`)
- Full auth UI in `apps/web`: sign in, sign up, verify email, forgot password, MFA setup
- All UI in Atlas theme using `DVantageLogo` and `@vantage/ui-kit` tokens

**Entitlements scaffolded:** `@RequiresEntitlement()` decorator + `useEntitlement()` React hook stubs (populated in M4).

**DB tables added in M1:**

- `users` — id, email, name, email_verified_at, created_at, updated_at
- `sessions` — id, user_id, token_hash, expires_at, created_at
- `oauth_accounts` — id, user_id, provider, provider_account_id, access_token_enc, refresh_token_enc
- `mfa_credentials` — id, user_id, type, secret_enc, created_at

---

## Resuming next session

When the next Claude session begins:

1. Read this entire handover before writing a single line.
2. Confirm understanding of all workflow rules — especially Rule 6 (Windows PowerShell file delivery).
3. Run `pnpm typecheck` from the repo root to confirm zero errors before starting M1.
4. Confirm Docker services are running: `docker compose ps` (all should show "healthy").
5. Propose M1 broken into sub-steps with deliverables. Get approval before coding.
6. For each approved sub-step, generate files to `/mnt/user-data/outputs/` and provide PowerShell `Expand-Archive` + `Copy-Item` commands.

**Do not skip steps. Do not bundle M1 into one dump. Approval gate after each meaningful unit of work.**

### Starting the local dev environment (reminder for user)

```powershell
# From repo root — start Docker services
pnpm dev:docker:up

# Terminal 1 — API
cd apps\api && pnpm dev

# Terminal 2 — Web
cd apps\web && pnpm dev
```

- API: http://localhost:3001
- Health: http://localhost:3001/health
- Swagger: http://localhost:3001/docs
- Web: http://localhost:3000
- Mailpit: http://localhost:8025
- MinIO: http://localhost:9001 (minioadmin / minioadmin)
