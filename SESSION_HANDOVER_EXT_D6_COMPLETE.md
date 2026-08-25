# Session Handover — D'Vantage

# Extension D6 COMPLETE · D7 Site Adapters — NEXT

**Project:** D'Vantage — AI Resume Intelligence & Inbox-Aware Job Application Platform
**Handover date:** 17 May 2026
**Status:** D6 shipped. Content script architecture live. Direction 2 "Warm Depth" UI deployed and verified. D7 is Greenhouse + Lever real selectors.

---

## How to use this handover

You are a new Claude session resuming an enterprise-grade engineering engagement.
Every decision in this document was deliberated and explicitly approved.
**Do not re-litigate any locked decision.** If something feels suboptimal, raise it — do not silently change it.

This handover **supersedes** `SESSION_HANDOVER_EXT_D5_COMPLETE.md`. All strategic context, phase plan, and locked decisions from that document remain in force. This document adds the D6 session delta only.

---

## Workflow rules (binding for every interaction)

1. **Enterprise-grade only.** Build as a 0.001 percentile engineer would. No shortcuts.
2. **Clarify before coding.** Every requirement must be understood before a single line is written.
3. **Approval before code.** Always present a plan and obtain explicit user approval before implementation.
   3a. **Corrections require confirmation.** When making a correction, confirm understanding before coding.
4. **Inspect existing files first.** Before writing or modifying, view existing files to understand structure and dependencies.
   4a. **Inspect new packages before using them.** After any `pnpm add`, before writing a single line: (1) `pnpm list <package>` to confirm version, (2) `node -e` smoke test.
5. **Validate TypeScript before deployment.** Run `pnpm exec tsc --noEmit` in each affected app before every deploy. No exceptions.
6. **File delivery via downloads + PowerShell.** User is on Windows with PowerShell. Never bash `mv`/`tar`. Never `Set-Content -Encoding UTF8` (adds BOM).
7. **Modal-based decisions.** When asking the user to choose between options, present as a tappable modal. Always leave room for additional input.
8. **Develop and test.** Every milestone ends with a testable deliverable verified in a real environment before the next milestone begins.

---

## D6 — What was built (M14 COMPLETE)

### Phase 1 — Content script architecture (12 files)

#### Extension — 12 files

| File                                  | Change                                                     |
| ------------------------------------- | ---------------------------------------------------------- |
| `content/index.ts`                    | REPLACED stub — full SPA-aware dispatcher                  |
| `content/sites/linkedin.ts`           | NEW — stub adapter                                         |
| `content/sites/indeed.ts`             | NEW — stub adapter                                         |
| `content/sites/greenhouse.ts`         | NEW — stub adapter                                         |
| `content/sites/lever.ts`              | NEW — stub adapter                                         |
| `content/sites/ashby.ts`              | NEW — stub adapter                                         |
| `content/sites/workday.ts`            | NEW — stub adapter                                         |
| `content/sites/generic.ts`            | NEW — stub adapter                                         |
| `background/message-router.ts`        | NEW — routes JOB_DETECTED, REQUEST_SCORE, REQUEST_AUTOFILL |
| `background/index.ts`                 | MODIFIED — router wired in as final delegate               |
| `sidepanel/components/ScorePanel.tsx` | NEW — job detection + scoring panel                        |
| `sidepanel/App.tsx`                   | MODIFIED — ScorePanel added below ProfilePanel             |

### Phase 2 — Direction 2 "Warm Depth" UI reskin (3 files)

| File                                  | Change                                                             |
| ------------------------------------- | ------------------------------------------------------------------ |
| `sidepanel/tokens.css`                | MODIFIED — 5 semantic alias tokens + `.dvantage-btn-ghost`         |
| `sidepanel/ProfilePanel.tsx`          | MODIFIED — inner card, rounded-square avatar, footer sign-out      |
| `sidepanel/components/ScorePanel.tsx` | MODIFIED — two-zone layout, brand icon wrap, persistent footer CTA |

---

## Architecture — Content script message flow (D6)

```
Content script (document_idle on job board pages)
  → resolveAdapter()          URL → site adapter (hostname match)
  → adapter.detectJD()        returns ExtractedJob | null
  → JOB_DETECTED              chrome.runtime.sendMessage (fire-and-forget)

Background SW (message-router.ts)
  → handleJobDetected()       chrome.storage.local.set(ACTIVE_JOB)

Side panel (ScorePanel.tsx)
  → chrome.storage.onChanged  fires on ACTIVE_JOB write
  → re-renders with job       title, company, location chip
  → "Score against my resume" → REQUEST_SCORE → handleRequestScore()
  → stub ScoreResult (800ms)  → renders score ring + gaps
```

### SPA navigation handling

LinkedIn, Indeed, Ashby, Workday are SPAs. `content/index.ts` intercepts:

- `history.pushState` override
- `history.replaceState` override
- `window.addEventListener('popstate')`

All three trigger `scheduleDetection()` — a 1 000 ms debounced call to `runDetection()`. This ensures DOM hydration is complete before adapter queries run.

---

## Direction 2 "Warm Depth" — Design decisions (locked)

### ProfilePanel

- Avatar: **rounded square** (10px radius), `surface-3` bg, `brand-300` initials
- Profile wrapped in **inner card**: `surface-1` bg, `border-2` border, `10px` radius
- Sign out: inside card footer with `border-1` top divider, `text-5` colour (very muted)
- Plan badge: Free = `text-5` on `surface-3`; Premium = `brand-300` on brand-alpha

### ScorePanel

- **Two-zone layout**: content zone (variable) + persistent footer (always rendered)
- Empty state icon: `44×44` rounded square, `8%` brand opacity bg, `20%` brand border
- Footer button states:
  - No job → `.dvantage-btn-ghost` (disabled, outline, `text-5`)
  - Job detected → `.dvantage-btn-primary` (`maxWidth: none`)
  - Scoring → primary + spinner animation
  - Scored → quiet `rescoreBtn` text link

### Token corrections

The following CSS variables were previously undefined (resolved to nothing). They are now aliased in `tokens.css`:

| Alias                 | Resolves to                |
| --------------------- | -------------------------- |
| `--vt-surface-raised` | `--vt-surface-1` (#0A0A0A) |
| `--vt-surface-border` | `--vt-border-2` (#2A2A2A)  |
| `--vt-text-primary`   | `--vt-text-1` (#FFFFFF)    |
| `--vt-text-secondary` | `--vt-text-3` (#A1A1AA)    |
| `--vt-text-disabled`  | `--vt-text-5` (#52525B)    |

**Rule:** New components must use Atlas primitives directly (`--vt-surface-1`, `--vt-text-4`, etc.), not aliases. Aliases exist only for backward compatibility with existing files.

---

## D6 test results — all passed ✅

| Test                                               | Result                                                |
| -------------------------------------------------- | ----------------------------------------------------- | -------------------- |
| TS compile — `tsc --noEmit`                        | ✅ Zero errors                                        |
| Build — `vite build` (54 modules)                  | ✅ 3.15s                                              |
| Extension loads in Chrome (Remove + Load unpacked) | ✅                                                    |
| Side panel — Direction 2 profile card visible      | ✅ Rounded-square avatar, inner card, footer sign-out |
| Side panel — empty state on any page               | ✅ Brand icon + ghost CTA button                      |
| Content script console log on greenhouse.io        | ✅ `[DVantage Content] Dispatcher ready               | adapter: greenhouse` |
| SPA nav debounce                                   | ✅ Re-detection fires ~1s after navigation            |
| Auth (sign in / sign out / refresh)                | ✅ D5 behaviour unchanged                             |
| API fly logs — token mint/refresh/revoke           | ✅ Clean                                              |

---

## Files to read at D7 session start (Rule 4)

```powershell
Get-Content "apps\extension\src\content\sites\greenhouse.ts" -Raw
Get-Content "apps\extension\src\content\sites\lever.ts" -Raw
Get-Content "apps\extension\src\content\index.ts" -Raw
Get-Content "apps\extension\src\shared\types.ts" -Raw
```

---

## Milestone status — UPDATED

| #       | Milestone                                                  | Status                       |
| ------- | ---------------------------------------------------------- | ---------------------------- |
| M0–M5   | Phase 1 MVP                                                | ✅ Complete                  |
| M6      | UX Fix: ATS score timing                                   | ✅ Complete                  |
| M7      | UX Fix: Export source = optimizedData                      | ✅ Complete                  |
| M8      | Stripe live webhook                                        | 🔜 Open                      |
| M9      | Extension D1: scaffold                                     | ✅ Complete                  |
| M10     | Extension D2: Auth shell                                   | ✅ Complete                  |
| M11     | Extension D3: Auth bridge (API + web)                      | ✅ Complete                  |
| M12     | Extension D4: Auth bridge (delivery)                       | ✅ Complete                  |
| M13     | Extension D5: Token expiry + refresh + profile display     | ✅ Complete                  |
| M14     | Extension D6: Content script architecture + Direction 2 UI | ✅ **Complete this session** |
| **M15** | **Extension D7: Greenhouse + Lever real selectors**        | 🔜 **NEXT**                  |

---

## Production infrastructure — current state

| Service   | URL                                     | Status                                 |
| --------- | --------------------------------------- | -------------------------------------- |
| API       | `https://api.dvantage.ca`               | ✅ Live — new machine (18:37 UTC)      |
| Web       | `https://dvantage.ca`                   | ✅ Live — Vercel auto-deploy from main |
| Database  | Fly Postgres `dvantage-db`              | ✅ Migrations 0000–0008 applied        |
| Redis     | Upstash `winning-cat-124272.upstash.io` | ✅ Live                                |
| Storage   | Cloudflare R2 `dvantage-resumes-prod`   | ✅ Live                                |
| Extension | Chrome — unpacked dev build             | ✅ Direction 2 UI verified             |

---

## All locked decisions (cumulative additions this session)

Decisions 1–79 from previous sessions remain fully locked.

### Session additions (NEW — locked 17 May 2026, D6)

**80. Site adapter stubs return null until D7–8** — All 7 site adapters (`linkedin`, `indeed`, `greenhouse`, `lever`, `ashby`, `workday`, `generic`) return `null` from `detectJD()` in D6. `JOB_DETECTED` is never sent; `ACTIVE_JOB` is never written; `ScorePanel` always shows empty state. This is correct. D7 adds real selectors to Greenhouse and Lever only.

**81. SPA navigation: 1 000 ms debounce** — `scheduleDetection()` waits 1 000 ms after `pushState` / `replaceState` / `popstate` before re-running detection. This gives React/Angular/Vue time to hydrate the new page DOM. Do not reduce below 800 ms.

**82. `JOB_DETECTED` validated for content-script origin** — `message-router.ts` checks `sender.tab` presence before processing `JOB_DETECTED`. Messages without `sender.tab` (i.e. not from a content script) are silently ignored. `REQUEST_SCORE` is the inverse — rejected if `sender.tab` is present.

**83. `REQUEST_SCORE` stub returns 800 ms delayed ScoreResult** — The stub in `message-router.ts` simulates real network latency to exercise the ScorePanel loading state. Score: 72, keyword gaps: ['TypeScript', 'NestJS', 'PostgreSQL', 'REST APIs'], semantic gaps: ['System design experience', 'Cross-functional leadership']. Replace entire stub block in D9 with real API call.

**84. ScorePanel is a two-zone layout (content + persistent footer)** — The footer CTA is always rendered. This is a UX decision: the ghost button in empty state communicates the panel's purpose before the user navigates to a job. Do not revert to early-return pattern.

**85. Direction 2 "Warm Depth" is the locked visual direction** — Rounded-square avatar, inner profile card, brand-tinted icon wrap, persistent footer CTA. All future extension UI components must follow this design language. The three rejected directions (Refined Minimal, Card Surface) are closed.

**86. Token aliases in `tokens.css` are for backward compatibility only** — New components use Atlas primitives (`--vt-surface-1`, `--vt-text-4`, etc.) directly. The 5 semantic aliases (`--vt-surface-raised`, etc.) exist only to prevent existing files from rendering with undefined variables.

**87. `.dvantage-btn-ghost` is the disabled persistent CTA style** — Used by ScorePanel footer when no job is detected. `cursor: not-allowed`, `color: text-5`, `border: 0.5px solid border-2`, `background: transparent`. Not interactive — communicates intent, not action.

---

## D7 scope — what comes next (M15)

Per the spec, D7 implements real DOM selectors for the two cleanest job boards:

**Greenhouse** (`boards.greenhouse.io`, `job-boards.greenhouse.io`):

- `detectJD()` — extract title, company, location, description from stable semantic selectors
- Server-side HTML — no SPA concerns; single `runDetection()` on load is sufficient

**Lever** (`jobs.lever.co`):

- `detectJD()` — extract title, company, location, description
- Server-side HTML — same as Greenhouse

Both adapters must return a valid `ExtractedJob`. Once working, navigating to a Greenhouse or Lever job posting will:

1. Fire `JOB_DETECTED` → write `ACTIVE_JOB`
2. `ScorePanel` transitions from empty state → job header card
3. "Score against my resume" button activates (primary style)
4. Click → 800 ms stub → score ring renders

D8 adds LinkedIn and Indeed. D9 wires the real scoring API.

---

## Repo changes this session (D6)

```
Commit daecbb4 — feat(extension): D6 UI — Direction 2 Warm Depth reskin
  apps/extension/src/sidepanel/tokens.css                ← MODIFIED
  apps/extension/src/sidepanel/ProfilePanel.tsx           ← MODIFIED
  apps/extension/src/sidepanel/components/ScorePanel.tsx  ← MODIFIED

Commit 9c43f86 — feat(extension): D6 — content script architecture
  apps/extension/src/background/message-router.ts         ← NEW
  apps/extension/src/background/index.ts                  ← MODIFIED
  apps/extension/src/content/index.ts                     ← MODIFIED
  apps/extension/src/content/sites/linkedin.ts            ← NEW
  apps/extension/src/content/sites/indeed.ts              ← NEW
  apps/extension/src/content/sites/greenhouse.ts          ← NEW
  apps/extension/src/content/sites/lever.ts               ← NEW
  apps/extension/src/content/sites/ashby.ts               ← NEW
  apps/extension/src/content/sites/workday.ts             ← NEW
  apps/extension/src/content/sites/generic.ts             ← NEW
  apps/extension/src/sidepanel/components/ScorePanel.tsx  ← NEW
  apps/extension/src/sidepanel/App.tsx                    ← MODIFIED
```

---

## Local dev commands

```powershell
# Repo root: C:\Users\Admin\OneDrive\Documents\AI_RESUME\vantage
docker compose up -d
pnpm --filter @vantage/api dev           # Terminal 1 — port 3001
pnpm --filter @vantage/worker-ai dev     # Terminal 2 — no port
pnpm --filter @vantage/web dev           # Terminal 3 — port 3000
pnpm --filter @vantage/extension build   # Build extension (always use build, not dev)
# Load apps/extension/dist/ in chrome://extensions (developer mode)
# IMPORTANT: After any manifest change → Remove + Load unpacked (not ↺ reload)
# IMPORTANT: After background/index.ts changes → click ↺ reload on extension card
# IMPORTANT: After sidepanel changes → click ↺ reload on extension card
```

---

## Reference documents

- `SESSION_HANDOVER_STRATEGIC_PIVOT.md` — authoritative for strategic context, VRIO, Porter's, GTM, phase plan
- `KICKOFF_DECISIONS_LOCKED.md` — authoritative for all 8 pre-kickoff decisions + Resume Categories design
- `CHROME_EXTENSION_V1_SPEC.md` — Phase 2 engineering spec — **read at D7 start**
- `INBOX_INTELLIGENCE_V1_SPEC.md` — Phase 3 engineering spec
- `SESSION_HANDOVER_MVP_COMPLETE.md` — Phase 1 carry-over context + R2 SigV4 fix documentation
- `Vantage_Brand_Codex.html` — Atlas tokens, logo system, voice

---

_D6 complete. The content script architecture is wired end-to-end. The panel knows what to do when a job is detected — it just can't detect one yet. D7 changes that: real Greenhouse and Lever selectors, and the full score flow fires for the first time on a live job posting._
