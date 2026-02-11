# Start SpendGuard backend server (PowerShell)
# Ensures DynamoDB is running and tables are created

Write-Host "Starting SpendGuard Backend..." -ForegroundColor Cyan

# Check if DynamoDB is running
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8000" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
} catch {
    Write-Host "Starting DynamoDB Local..." -ForegroundColor Yellow
    docker-compose up -d dynamodb-local
    Start-Sleep -Seconds 5
}

# Setup tables
Write-Host "Setting up DynamoDB tables..." -ForegroundColor Cyan
$env:DYNAMODB_ENDPOINT = "http://localhost:8000"
$env:AWS_REGION = "us-east-1"
& "scripts\setup-dynamodb.ps1"

# Set environment variables
$env:USE_IN_MEMORY = "false"
$env:DYNAMODB_ENDPOINT = "http://localhost:8000"
$env:AWS_REGION = "us-east-1"
$env:LOG_LEVEL = "INFO"

# Start backend
Write-Host "Starting backend server on port 5050..." -ForegroundColor Green
npm start
