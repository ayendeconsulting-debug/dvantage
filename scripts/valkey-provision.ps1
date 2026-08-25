<#
.SYNOPSIS
  Provisions the dvantage-valkey Fly app and points dvantage-api and
  dvantage-worker at it.

.DESCRIPTION
  Replaces the archived Upstash free-tier database (incident 2026-08-24).
  Safe to re-run: every step checks for existing state first. The only
  non-idempotent action is password generation, which is skipped if
  VALKEY_PASSWORD is already set on the app.

.NOTES
  Run from the repo root:  .\scripts\valkey-provision.ps1
  Requires flyctl on PATH and an authenticated session (flyctl auth whoami).
#>

$ErrorActionPreference = 'Stop'

$App       = 'dvantage-valkey'
$Region    = 'yyz'
$Volume    = 'valkey_data'
$ConfigPath = 'infra/valkey/fly.valkey.toml'

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }

# --- Preflight ---------------------------------------------------------------
Write-Step 'Preflight'
if (-not (Get-Command flyctl -ErrorAction SilentlyContinue)) {
  throw "flyctl not found on PATH. Install: iwr https://fly.io/install.ps1 -useb | iex   then add `$env:USERPROFILE\.fly\bin to PATH."
}
if (-not (Test-Path $ConfigPath)) {
  throw "$ConfigPath not found. Run this from the repo root (C:\Dev\AI_RESUME\vantage)."
}
flyctl auth whoami | Out-Null
Write-Host "flyctl OK, config found." -ForegroundColor Green

# --- 1. App ------------------------------------------------------------------
Write-Step "Creating app $App"
$existingApps = flyctl apps list 2>$null | Out-String
if ($existingApps -match [regex]::Escape($App)) {
  Write-Host "App $App already exists — skipping." -ForegroundColor Yellow
} else {
  flyctl apps create $App --org personal
}

# --- 2. Volume ---------------------------------------------------------------
Write-Step "Creating 1GB volume '$Volume' in $Region"
$existingVols = flyctl volumes list --app $App 2>$null | Out-String
if ($existingVols -match [regex]::Escape($Volume)) {
  Write-Host "Volume $Volume already exists — skipping." -ForegroundColor Yellow
} else {
  flyctl volumes create $Volume --size 1 --region $Region --app $App --yes
}

# --- 3. Password -------------------------------------------------------------
Write-Step 'Setting VALKEY_PASSWORD'
$existingSecrets = flyctl secrets list --app $App 2>$null | Out-String
if ($existingSecrets -match 'VALKEY_PASSWORD') {
  Write-Host "VALKEY_PASSWORD already set." -ForegroundColor Yellow
  Write-Host "This script cannot read it back (Fly secrets are write-only)." -ForegroundColor Yellow
  Write-Host "Retrieve it from your password manager, or re-run with -Rotate to generate a new one." -ForegroundColor Yellow
  $pw = Read-Host 'Paste the existing VALKEY_PASSWORD to build REDIS_URL' -AsSecureString
  $pw = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
          [Runtime.InteropServices.Marshal]::SecureStringToBSTR($pw))
} else {
  # 48 chars from an unambiguous alphanumeric set — no URL-escaping needed
  # in the redis:// connection string.
  $chars = (48..57) + (65..90) + (97..122)
  $pw = -join ($chars | Get-Random -Count 48 | ForEach-Object { [char]$_ })
  flyctl secrets set "VALKEY_PASSWORD=$pw" --app $App
  Write-Host "`n  STORE THIS IN YOUR PASSWORD MANAGER NOW — Fly will not show it again:" -ForegroundColor Red
  Write-Host "  $pw`n" -ForegroundColor Red
}

# --- 4. Deploy ---------------------------------------------------------------
Write-Step 'Deploying Valkey'
flyctl deploy --config $ConfigPath --app $App

# --- 5. Private IPv6 ---------------------------------------------------------
Write-Step 'Allocating private IPv6 (flycast)'
$existingIps = flyctl ips list --app $App 2>$null | Out-String
if ($existingIps -match 'private') {
  Write-Host 'Private IP already allocated — skipping.' -ForegroundColor Yellow
} else {
  flyctl ips allocate-v6 --private --app $App
}

# --- 6. Wire up both consumers ----------------------------------------------
# Locked decision 36 principle: dvantage-api and dvantage-worker must always
# carry matching connection strings. Any rotation applies to both.
Write-Step 'Setting REDIS_URL on dvantage-api and dvantage-worker'
$RedisUrl = "redis://default:$pw@$App.flycast:6379"

flyctl secrets set "REDIS_URL=$RedisUrl" --app dvantage-api
flyctl secrets set "REDIS_URL=$RedisUrl" --app dvantage-worker

Write-Step 'Done'
Write-Host @"
Both apps are rolling-restarting now (setting a secret triggers this).

Verify:
  flyctl status --app dvantage-valkey
  flyctl logs   --app dvantage-api    | Select-String 'Redis'
  flyctl logs   --app dvantage-worker | Select-String 'Redis'

Expect 'Redis connected' and 'Redis ready' in the API log within ~60s.

KNOWN GOTCHA: .flycast resolves over IPv6. postgres.js handles this today
for dvantage-db.flycast, but ioredis may need an explicit family. If you see
ENOTFOUND or ECONNREFUSED against dvantage-valkey.flycast, add `family: 6`
to the options object in BOTH:
  apps/api/src/redis/redis.module.ts
  packages/queue/src/connection.ts

Every user is logged out — the old sessions died with the archived Upstash DB.
"@ -ForegroundColor Green
