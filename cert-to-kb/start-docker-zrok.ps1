#!/usr/bin/env powershell
# cert-to-kb Docker + zrok Start Script
# Run this from the cert-to-kb directory. Reads Notion/auth config from .env.

param(
    [string]$CertsFolder = (Resolve-Path (Join-Path $PSScriptRoot "../docs/certificates")).Path,
    [int]$Port = 3000
)

Write-Host "Starting cert-to-kb with Docker + zrok..." -ForegroundColor Cyan

# Check if Docker is running
try {
    docker info *> $null
    if ($LASTEXITCODE -ne 0) { throw "Docker daemon not reachable" }
} catch {
    Write-Host "Docker is not running. Please start Docker Desktop." -ForegroundColor Red
    exit 1
}

# Locate the zrok binary: PATH first, then this project's own zrok2.exe/zrok.exe
$zrokExe = $null
foreach ($candidate in @("zrok2", "zrok")) {
    $cmd = Get-Command $candidate -ErrorAction SilentlyContinue
    if ($cmd) { $zrokExe = $cmd.Source; break }
}
if (-not $zrokExe) {
    foreach ($candidate in @("zrok2.exe", "zrok.exe")) {
        $local = Join-Path $PSScriptRoot $candidate
        if (Test-Path $local) { $zrokExe = $local; break }
    }
}
if (-not $zrokExe) {
    Write-Host "zrok is not installed or found. Please install from https://zrok.io" -ForegroundColor Red
    exit 1
}
Write-Host "Using zrok binary: $zrokExe" -ForegroundColor DarkGray

# Check .env exists
$envFile = Join-Path $PSScriptRoot ".env"
if (-not (Test-Path $envFile)) {
    Write-Host ".env not found. Copy .env.example to .env and fill in NOTION_API_KEY / NOTION_DATABASE_ID first." -ForegroundColor Red
    exit 1
}

# Check certs folder has PDFs
if (-not (Test-Path $CertsFolder)) {
    Write-Host "Certificates folder not found: $CertsFolder" -ForegroundColor Red
    exit 1
}
$pdfCount = (Get-ChildItem -Path $CertsFolder -Filter "*.pdf" -ErrorAction SilentlyContinue).Count
if ($pdfCount -eq 0) {
    Write-Host "WARNING: No PDF certificates found in $CertsFolder" -ForegroundColor Yellow
} else {
    Write-Host "Found $pdfCount certificate(s) in $CertsFolder" -ForegroundColor DarkGray
}

# Build Docker image
Write-Host "Building Docker image..." -ForegroundColor Cyan
docker build -t cert-to-kb $PSScriptRoot
if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker build failed." -ForegroundColor Red
    exit 1
}

# Run Docker container (mounts docs/certificates directly, no copy needed)
Write-Host "Starting Docker container..." -ForegroundColor Cyan
docker rm -f cert-to-kb *> $null
docker run -d --name cert-to-kb `
    -p "${Port}:3000" `
    --env-file $envFile `
    -e MCP_SERVER_HOST=0.0.0.0 `
    -e CERTIFICATES_FOLDER=/app/certs `
    -v "${CertsFolder}:/app/certs:ro" `
    cert-to-kb

if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker run failed." -ForegroundColor Red
    exit 1
}

# Wait for server to become healthy
Write-Host "Waiting for server to start..." -ForegroundColor Cyan
$healthy = $false
for ($i = 0; $i -lt 15; $i++) {
    Start-Sleep -Seconds 1
    try {
        $resp = Invoke-WebRequest -Uri "http://localhost:$Port/health" -UseBasicParsing -TimeoutSec 2
        if ($resp.StatusCode -eq 200) { $healthy = $true; break }
    } catch { }
}
if (-not $healthy) {
    Write-Host "Server did not become healthy in time. Check: docker logs cert-to-kb" -ForegroundColor Red
    exit 1
}
Write-Host "Server is healthy on http://localhost:$Port" -ForegroundColor Green

# Expose with zrok (v2 CLI: 'share public <target> --headless'), in the background so we
# can capture the assigned hostname and still print it before the script blocks.
Write-Host "Exposing with zrok..." -ForegroundColor Cyan
$zrokOutLog = Join-Path $env:TEMP "cert-to-kb-zrok.out.log"
$zrokErrLog = Join-Path $env:TEMP "cert-to-kb-zrok.err.log"
Remove-Item $zrokOutLog, $zrokErrLog -Force -ErrorAction SilentlyContinue
$zrokProc = Start-Process -FilePath $zrokExe `
    -ArgumentList @("share", "public", "http://localhost:$Port", "--headless") `
    -RedirectStandardOutput $zrokOutLog -RedirectStandardError $zrokErrLog -PassThru -NoNewWindow

$zrokUrl = $null
for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 1
    foreach ($log in @($zrokOutLog, $zrokErrLog)) {
        if (Test-Path $log) {
            $match = Select-String -Path $log -Pattern '([a-z0-9]+\.shares\.zrok\.io)' -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($match) { $zrokUrl = "https://$($match.Matches[0].Groups[1].Value)"; break }
        }
    }
    if ($zrokUrl) { break }
    if ($zrokProc.HasExited) {
        Write-Host "zrok exited unexpectedly. Log output:" -ForegroundColor Red
        Get-Content $zrokOutLog, $zrokErrLog -ErrorAction SilentlyContinue
        exit 1
    }
}

if (-not $zrokUrl) {
    Write-Host "Could not detect zrok URL in time. Check the logs at $zrokOutLog / $zrokErrLog" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "cert-to-kb MCP Server is running!" -ForegroundColor Green
Write-Host ""
Write-Host "Docker container: cert-to-kb (local http://localhost:$Port)" -ForegroundColor Cyan
Write-Host "zrok URL: $zrokUrl" -ForegroundColor Cyan
Write-Host ""
Write-Host "To add to Mistral Studio:" -ForegroundColor Cyan
Write-Host "1. Go to: https://studio.mistral.ai" -ForegroundColor Cyan
Write-Host "2. Connectors -> + Add Connector -> Custom MCP Connector" -ForegroundColor Cyan
Write-Host "3. URL: $zrokUrl/mcp" -ForegroundColor Cyan
Write-Host "4. If MCP_AUTH_TOKEN is set in .env, add it as a Bearer token credential" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press Ctrl+C to stop the tunnel (the container keeps running until you 'docker stop cert-to-kb')." -ForegroundColor Yellow

try {
    Wait-Process -Id $zrokProc.Id
} finally {
    Write-Host ""
    Write-Host "zrok tunnel stopped. To also stop the container:" -ForegroundColor Cyan
    Write-Host "  docker stop cert-to-kb; docker rm cert-to-kb" -ForegroundColor Cyan
}
