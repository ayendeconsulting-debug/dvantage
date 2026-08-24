# dvantage-valkey — cache + BullMQ broker

Self-hosted Valkey 8 on Fly.io in `yyz`. Replaces the Upstash free-tier
database that was archived on 2026-08-24, taking the production API down.

**Reached only over the Fly private network** at `dvantage-valkey.flycast:6379`.
No public IP, no TLS termination, no internet exposure — same pattern as
`dvantage-db.flycast`.

---

## Why we left Upstash free tier

Not a cost decision — a **hard capacity ceiling**:

| Upstash free tier                                                 | Our actual load                                                      |
| ----------------------------------------------------------------- | -------------------------------------------------------------------- |
| 10,000 commands / day                                             | BullMQ alone is ~52,000/day **idle** (3 workers × ~5s blocking poll) |
| Over-limit behaviour: _"the exceeding commands return exception"_ | Would surface as intermittent job failures, not a clean error        |
| Archived after 30 days of inactivity                              | Exactly what happened on 2026-08-24                                  |

better-auth also does a Redis `GET` on effectively every authenticated request,
on top of the queue traffic. 10k/day is ~7 commands/minute sustained. There is
no configuration of this app that fits inside it.

**Cost here:** $2.02/mo (256MB shared-cpu-1x) + $0.15/mo (1GB volume) ≈ **$2.20/mo**.

---

## What broke, and why it broke _everything_

The failure chain is worth keeping written down, because only the first link
was about Redis:

1. Upstash archived the database → `winning-cat-124272.upstash.io` stopped
   resolving (`ENOTFOUND` — DNS, not a timeout)
2. `RedisHealthIndicator.isHealthy()` threw
3. Terminus fails the whole check if any indicator throws → `GET /health` = **503**
4. Fly's health check marked the machine unhealthy
5. An unhealthy machine **stops counting toward `min_machines_running`**, and
   `auto_stop_machines = 'stop'` parked it
6. No healthy machine → Fly's edge returned its own 503, carrying **no CORS
   headers** → the browser reported it as a CORS policy error, sending the
   investigation in the wrong direction entirely

Three fixes landed together so no single link can repeat this:

- `redis.health.indicator.ts` — `isHealthyOptional()` never throws; reports
  `degraded: true` and still returns `up`
- `health.controller.ts` — Redis moved to the degraded tier; `/health/live` added
- `fly.api.toml` — `auto_stop_machines = false`, grace period 30s → 60s
- `auth.config.ts` — `secondaryStorage` get/set/delete fail soft

---

## Provisioning

From the repo root:

```powershell
.\scripts\valkey-provision.ps1
```

Idempotent apart from password generation. Or manually:

```powershell
flyctl apps create dvantage-valkey --org personal
flyctl volumes create valkey_data --size 1 --region yyz --app dvantage-valkey --yes
flyctl secrets set VALKEY_PASSWORD="<48-char-random>" --app dvantage-valkey
flyctl deploy --config infra/valkey/fly.valkey.toml --app dvantage-valkey
flyctl ips allocate-v6 --private --app dvantage-valkey

$url = "redis://default:<password>@dvantage-valkey.flycast:6379"
flyctl secrets set "REDIS_URL=$url" --app dvantage-api
flyctl secrets set "REDIS_URL=$url" --app dvantage-worker
```

> **Locked decision 36 applies to Redis as well as Postgres.** `dvantage-api`
> and `dvantage-worker` must always carry matching `REDIS_URL`. Any rotation
> goes to both apps in the same sitting, or the worker silently stops
> processing — the D14 failure mode.

---

## Verification — run all four

**1. Valkey is up**

```powershell
flyctl status --app dvantage-valkey
flyctl ssh console --app dvantage-valkey -C "valkey-cli -a $env:VALKEY_PASSWORD ping"   # PONG
```

**2. Both consumers connected**

```powershell
flyctl logs --app dvantage-api    | Select-String 'Redis'   # "Redis connected" / "Redis ready"
flyctl logs --app dvantage-worker | Select-String 'Redis'
```

**3. Config is what we asked for**

```powershell
flyctl ssh console --app dvantage-valkey -C "valkey-cli -a $env:VALKEY_PASSWORD config get maxmemory-policy"
# MUST be: noeviction
```

Under `allkeys-lru` Valkey silently evicts BullMQ job hashes and wait/active
lists under memory pressure. Jobs vanish with no error, no failure event, and
no DB status change — rows sit in `pending` forever. Audit finding REL-5.

**4. The degradation path actually works — do this on purpose**

This is the step that proves the incident cannot repeat. Do it now, in
daylight, not at 2am.

```powershell
# a. Sign in to dvantage.ca, land on the dashboard.
# b. Stop the broker:
flyctl machine stop <machine-id> --app dvantage-valkey

# c. Expected, within 30s:
#    - GET https://api.dvantage.ca/health returns 200
#      with info.redis.degraded === true
#    - API logs: "Redis DEGRADED — cache and queue unavailable, API still serving"
#    - dvantage-api machine stays in "started", is NOT parked
#    - Reloading the dashboard still authenticates    <-- the uncertain one
#    - Enqueueing a resume parse fails (expected — no broker)

# d. Restart and confirm the degraded flag clears:
flyctl machine start <machine-id> --app dvantage-valkey
```

**If step (c) "reloading the dashboard still authenticates" fails**, the
better-auth database fallback does not behave as documented in `^1.6.0`. Read
the note in `auth.config.ts` above `secondaryStorage` — the fix is a change to
`session.storeSessionInDatabase`, but which direction depends on the installed
source, so verify against `node_modules` before changing it. Everything else in
this incident fix is independent of that question and holds regardless.

---

## Operating notes

**Memory.** `maxmemory 200mb` with `noeviction`. A full Valkey **refuses
writes** rather than evicting — enqueues fail loudly, which is the behaviour we
want, but it does mean you must watch headroom:

```powershell
flyctl ssh console --app dvantage-valkey -C "valkey-cli -a $env:VALKEY_PASSWORD info memory"
```

Bump to a 512MB machine (`memory = '512mb'`, `VALKEY_MAXMEMORY = '400mb'`)
before `used_memory` reaches ~80% of maxmemory.

**Persistence.** AOF with `appendfsync everysec` on the `valkey_data` volume.
Worst case on an unclean stop is ~1s of writes — acceptable for sessions
(re-login) and BullMQ (jobs re-enqueue).

**Backups.** None configured, deliberately. Nothing here is a system of record:
sessions regenerate on sign-in, queue state is transient, Postgres holds
everything durable. Do **not** start storing anything here that isn't
reconstructible.

**Rotating the password.**

```powershell
$pw = -join ((48..57)+(65..90)+(97..122) | Get-Random -Count 48 | % {[char]$_})
flyctl secrets set "VALKEY_PASSWORD=$pw" --app dvantage-valkey
$url = "redis://default:$pw@dvantage-valkey.flycast:6379"
flyctl secrets set "REDIS_URL=$url" --app dvantage-api
flyctl secrets set "REDIS_URL=$url" --app dvantage-worker
```

Brief disconnect while all three roll. Sessions survive (Postgres); in-flight
jobs retry.

---

## Known gotcha — IPv6

`.flycast` resolves over IPv6. `postgres.js` handles this today for
`dvantage-db.flycast`, but **ioredis may not without an explicit family**.

If you see `ENOTFOUND` or `ECONNREFUSED` against `dvantage-valkey.flycast`, add
`family: 6` to the options object in **both**:

- `apps/api/src/redis/redis.module.ts` → `new Redis(url, { ... })`
- `packages/queue/src/connection.ts` → `new Redis(redisUrl, { ... })`

Both, or the API connects and the worker doesn't.

---

## Still open

- **No alerting.** This outage was discovered because login broke. Point an
  uptime monitor at `https://api.dvantage.ca/health` on a 1-minute interval,
  alerting to phone — and separately alert on `info.redis.degraded === true`,
  which is now a 200 and will not trip a naive status-code check.
- **Single machine.** `flyctl scale count 2 --app dvantage-api` so one bad
  machine is degradation rather than an outage.
- **Single Valkey node.** No replica. Acceptable while it holds nothing
  durable; revisit if session loss during a restart becomes user-visible.
- **Sessions and queue share one instance.** `packages/queue/src/connection.ts`
  warns against sharing the _connection_ (it uses a separate client, correctly),
  but they share the instance. Split to DB index 1 for the queue if contention
  ever shows up.
