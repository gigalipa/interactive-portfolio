#!/usr/bin/env powershell
# cert-to-kb Docker + zrok Start Script
# Run this from the cert-to-kb directory

param(
    [string]$NotionApiKey,
    [string]$NotionDatabaseId = "5ddd97f8-4124-4581-9fbe-8eef41d10d71",
    [string]$CertsFolder = "$PWD/certs",
    [string]$McpAuthToken = $env:MCP_AUTH_TOKEN
)

Write-Host "Starting cert-to-kb with Docker + zrok..." -ForegroundColor Cyan

# Check if Docker is running
try {
    docker --version | Out-Null
} catch {
    Write-Host "Docker is not running. Please start Docker Desktop." -ForegroundColor Red
    exit 1
}

# Check if zrok or zrok2 is installed
$zrokCmd = if (Get-Command zrok2 -ErrorAction SilentlyContinue) { "zrok2" } 
           elseif (Get-Command zrok -ErrorAction SilentlyContinue) { "zrok" } 
           else { $null }

if (-not $zrokCmd) {
    Write-Host "zrok is not installed. Please install from https://zrok.io" -ForegroundColor Red
    exit 1
}

# Create certs folder if it doesn't exist
if (-not (Test-Path $CertsFolder)) {
    New-Item -ItemType Directory -Path $CertsFolder | Out-Null
    Write-Host "Created certs folder at: $CertsFolder" -ForegroundColor Yellow
    Write-Host "Please copy your PDF certificates to this folder." -ForegroundColor Yellow
}

# Check if certs folder has PDFs
$pdfCount = (Get-ChildItem -Path $CertsFolder -Filter "*.pdf" -ErrorAction SilentlyContinue).Count
if ($pdfCount -eq 0) {
    Write-Host "WARNING: No PDF certificates found in $CertsFolder" -ForegroundColor Yellow
}

# Get environment variables
if ([string]::IsNullOrEmpty($NotionApiKey)) {
    $NotionApiKey = $env:NOTION_API_KEY
    if ([string]::IsNullOrEmpty($NotionApiKey)) {
        $NotionApiKey = Read-Host "Enter your Notion API key"
    }
}

# Validate inputs
if ([string]::IsNullOrEmpty($NotionApiKey)) {
    Write-Host "Notion API key is required." -ForegroundColor Red
    exit 1
}

# Build Docker image
Write-Host "Building Docker image..." -ForegroundColor Cyan
docker build -t cert-to-kb .
if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker build failed." -ForegroundColor Red
    exit 1
}

# Run Docker container
Write-Host "Starting Docker container..." -ForegroundColor Cyan
docker run -d --name cert-to-kb `
    -p 3000:3000 `
    -e NOTION_API_KEY=$NotionApiKey `
    -e NOTION_DATABASE_ID=$NotionDatabaseId `
    -e CERTIFICATES_FOLDER=/app/certs `
    -e MCP_SERVER_HOST=0.0.0.0 `
    -e MCP_AUTH_TOKEN=$McpAuthToken `
    -v "$PWD/certs:/app/certs:ro" `
    cert-to-kb

if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker run failed." -ForegroundColor Red
    exit 1
}

# Wait for server to start
Start-Sleep -Seconds 5

# Expose with zrok
Write-Host "Exposing with $zrokCmd..." -ForegroundColor Cyan
& $zrokCmd share http 3000 --headless

if ($LASTEXITCODE -ne 0) {
    Write-Host "zrok failed to start." -ForegroundColor Red
    exit 1
}

Write-Host "" -ForegroundColor Green
Write-Host "✅ cert-to-kb MCP Server is running!" -ForegroundColor Green
Write-Host "" -ForegroundColor Green
Write-Host "Docker container: cert-to-kb" -ForegroundColor Cyan
Write-Host "Local URL: http://localhost:3000" -ForegroundColor Cyan
Write-Host "zrok URL: Check $zrokCmd dashboard or run '$zrokCmd list'" -ForegroundColor Cyan
Write-Host "" -ForegroundColor Green
Write-Host "To add to Mistral Studio:" -ForegroundColor Cyan
Write-Host "1. Go to: https://studio.mistral.ai" -ForegroundColor Cyan
Write-Host "2. Connectors -> + Add Connector -> Custom MCP Connector" -ForegroundColor Cyan
Write-Host "3. Use the zrok URL from above, with /mcp appended (e.g. https://abc123.zrok.io/mcp)" -ForegroundColor Cyan
Write-Host "" -ForegroundColor Green
Write-Host "To stop:" -ForegroundColor Cyan
Write-Host "  docker stop cert-to-kb" -ForegroundColor Cyan
Write-Host "  docker rm cert-to-kb" -ForegroundColor Cyan
Write-Host "  $zrokCmd end <share-id>" -ForegroundColor Cyan
