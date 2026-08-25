# Monitoring

Added 2026-08-24, after a production outage whose discovery mechanism was a
user hitting a broken login page.

## What went wrong, and why monitoring is the actual fix

The Upstash Redis database was archived after 30 days of inactivity. The health
check treated Redis as critical, so `/health` returned 503, Fly marked the only
machine unhealthy, `auto_stop_machines` parked it, and the edge served a 503
with no CORS headers — which surfaced in the browser as a CORS policy error and
sent the first hour of investigation in the wrong direction.

Every one of those links has been fixed. **None of that mattered as much as the
fact that nothing was watching.** The outage ran until someone tried to log in.

---

## Check 1 — API is serving

The baseline. Catches machine parking, crash loops, bad deploys, DNS and
certificate expiry.

|             |                                                    |
| ----------- | -------------------------------------------------- |
| URL         | `https://api.dvantage.ca/health`                   |
| Method      | GET                                                |
| Interval    | **1 minute**                                       |
| Expect      | HTTP `200`                                         |
| Timeout     | 10s                                                |
| Alert after | 2 consecutive failures (avoids paging on one blip) |
| Notify      | **Push to phone**, plus email                      |

Free tiers that do 1-minute checks with phone alerts: UptimeRobot, Better Stack,
Healthchecks.io. Any is fine — having one matters far more than which.

## Check 2 — Redis degraded ← **do not skip this one**

`/health` now returns **200 when Redis is down**. That is deliberate — a cache
outage must not remove the API from the load balancer, which is the whole fix
above — but it has a direct consequence:

> **A status-code-only monitor will never tell you Redis is down again.**

You traded a loud failure for a silent one, and this check is what buys back the
signal.

|             |                                                      |
| ----------- | ---------------------------------------------------- |
| URL         | `https://api.dvantage.ca/health`                     |
| Interval    | 5 minutes                                            |
| Expect      | response body does **NOT** contain `"degraded":true` |
| Alert after | 2 consecutive matches                                |
| Notify      | Email is enough — degraded is not a 3am problem      |

Configure as a **keyword monitor**, alerting when the keyword `"degraded":true`
is **found**.

The degraded payload looks like:

```json
{
  "status": "ok",
  "info": {
    "database": { "status": "up", "responseTime": 12 },
    "redis": { "status": "up", "degraded": true, "message": "getaddrinfo ENOTFOUND …" }
  }
}
```

What being in this state actually costs you: no queued jobs (resume parse, ATS
score, optimize all fail to enqueue), cold sessions on every request, and no
AI-fill daily budget enforcement — that check fails open by design. The API
stays up and users can browse. Worth fixing the same day; not worth waking up
for.

## Check 3 — Worker is processing

**Not yet possible.** `dvantage-worker` has no HTTP server and no health check
of any kind, so the D14 failure mode — worker up, every job failing silently —
remains invisible. Tracked as REL-2 in the platform audit.

Until it ships, the closest proxy is a daily manual look:

```powershell
flyctl logs --app dvantage-worker | Select-String 'Redis|error|failed'
```

That is not monitoring. Ship the worker health check.

## Check 4 — Certificate expiry

Most uptime services include this free. Set it to alert **14 days** before
expiry on `api.dvantage.ca` and `dvantage.ca`. Fly and Vercel both auto-renew,
so this only fires when auto-renewal has failed — which is exactly when you
need the warning.

---

## Alert routing

| Condition                   | Urgency                 | Channel      |
| --------------------------- | ----------------------- | ------------ |
| `/health` non-200, 2 checks | **Wake me**             | Push + email |
| `"degraded":true` present   | Same day                | Email        |
| Cert expiring < 14 days     | This week               | Email        |
| Worker silent               | _(no check exists yet)_ | —            |

Route the first one to your phone specifically. It is the only condition here
where minutes matter, and if everything pages equally, nothing does.

---

## Still missing

Honest list of what this document does **not** give you:

- **No error tracking.** `SENTRY_DSN` is read in `apps/api/src/main.ts`, but
  there is no Sentry in the web app or the extension, and no `error.tsx`
  anywhere in the App Router. A render-time crash shows a paying user Next's
  default error page and notifies nobody.
- **No queue depth metric.** Jobs could back up for hours without a signal.
- **No cost telemetry.** `response.usage` is discarded at all four Anthropic
  call sites. A spend anomaly would first appear on the invoice.
- **No synthetic user journey.** These checks prove the API answers, not that
  someone can actually sign in, upload a resume and get a score.

The first is the highest value per hour and should be next.
