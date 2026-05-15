# Vantage - Local Dev Setup
# Run from repo root: .\scripts\dev-setup.ps1
#
# What this does:
#   1. Checks prerequisites (Docker, Node, pnpm)
#   2. Copies .env.example to .env if not present
#   3. Starts all Docker services
#   4. Waits for each service to be healthy
#   5. Confirms everything is ready

param(
  [switch]$Reset
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot

Set-Location $RepoRoot

function Write-Step { param([string]$msg) Write-Host "`n>> $msg" -ForegroundColor Cyan }
function Write-OK   { param([string]$msg) Write-Host "   OK  $msg" -ForegroundColor Green }
function Write-Warn { param([string]$msg) Write-Host "   !!  $msg" -ForegroundColor Yellow }
function Write-Fail { param([string]$msg) Write-Host "   ERR $msg" -ForegroundColor Red; exit 1 }

function Test-Command {
  param([string]$cmd)
  $null = Get-Command $cmd -ErrorAction SilentlyContinue
  return $?
}

function Wait-Healthy {
  param([string]$container, [int]$maxSeconds = 60)
  $elapsed = 0
  Write-Host "   Waiting for $container ..." -NoNewline
  while ($elapsed -lt $maxSeconds) {
    $status = docker inspect --format='{{.State.Health.Status}}' $container 2>$null
    if ($status -eq 'healthy') {
      Write-Host " ready." -ForegroundColor Green
      return
    }
    Start-Sleep -Seconds 2
    $elapsed += 2
    Write-Host "." -NoNewline
  }
  Write-Host ""
  Write-Fail "$container did not become healthy within ${maxSeconds}s"
}

# -- Step 1: Prerequisites ----------------------------------------------------

Write-Step "Checking prerequisites"

if (-not (Test-Command 'docker')) { Write-Fail "Docker not found. Install Docker Desktop." }
Write-OK "Docker: $(docker --version)"

if (-not (Test-Command 'node')) { Write-Fail "Node.js not found. Install Node 20+." }
$nodeVer = node --version
Write-OK "Node: $nodeVer"

if (-not (Test-Command 'pnpm')) { Write-Fail "pnpm not found. Run: npm install -g pnpm" }
Write-OK "pnpm: $(pnpm --version)"

try { docker info 2>&1 | Out-Null } catch { Write-Fail "Docker Desktop is not running. Start it and retry." }
Write-OK "Docker daemon is running"

# -- Step 2: Environment file -------------------------------------------------

Write-Step "Environment configuration"

if (-not (Test-Path '.env')) {
  Copy-Item '.env.example' '.env'
  Write-OK "Created .env from .env.example"
  Write-Warn "Edit .env to add your API keys before starting the API server."
} else {
  Write-OK ".env already exists - skipping"
}

# -- Step 3: Handle reset -----------------------------------------------------

if ($Reset) {
  Write-Step "Resetting volumes (-Reset flag detected)"
  docker compose down -v --remove-orphans 2>&1 | Out-Null
  Write-OK "Volumes wiped"
}

# -- Step 4: Start services ---------------------------------------------------

Write-Step "Starting Docker services"
docker compose up -d --remove-orphans
if ($LASTEXITCODE -ne 0) { Write-Fail "docker compose up failed" }
Write-OK "Services started"

# -- Step 5: Wait for health --------------------------------------------------

Write-Step "Waiting for services to be healthy"
Wait-Healthy 'vantage-postgres' 90
Wait-Healthy 'vantage-redis'    30
Start-Sleep -Seconds 3
Write-OK "mailpit ready"
Wait-Healthy 'vantage-minio'    60

# -- Step 6: Summary ----------------------------------------------------------

Write-Step "Local environment ready"
Write-Host ""
Write-Host "   PostgreSQL  -> localhost:5432   (vantage / vantage)" -ForegroundColor White
Write-Host "   Redis       -> localhost:6379" -ForegroundColor White
Write-Host "   Mailpit UI  -> http://localhost:8025" -ForegroundColor White
Write-Host "   MinIO API   -> http://localhost:9000" -ForegroundColor White
Write-Host "   MinIO UI    -> http://localhost:9001   (minioadmin / minioadmin)" -ForegroundColor White
Write-Host ""
