# Start SpendGuard backend server in AWS mode (PowerShell)
# Requires AWS credentials configured via AWS CLI or environment variables

Write-Host "Starting SpendGuard Backend in AWS Mode..." -ForegroundColor Cyan

# Verify AWS credentials
Write-Host "Checking AWS credentials..." -ForegroundColor Cyan
try {
    $awsIdentity = aws sts get-caller-identity 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: AWS credentials not configured!" -ForegroundColor Red
        Write-Host "Please configure AWS credentials using:" -ForegroundColor Yellow
        Write-Host "  aws configure" -ForegroundColor Yellow
        Write-Host "  OR set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables" -ForegroundColor Yellow
        exit 1
    }
    Write-Host "AWS credentials verified" -ForegroundColor Green
    Write-Host $awsIdentity -ForegroundColor Gray
} catch {
    Write-Host "ERROR: AWS CLI not found or credentials not configured!" -ForegroundColor Red
    exit 1
}

# Set environment variables for AWS mode
$env:STORAGE_MODE = "aws"
$env:USE_IN_MEMORY = "false"
$env:AWS_REGION = if ($env:AWS_REGION) { $env:AWS_REGION } else { "us-east-1" }
$env:EXPENSES_TABLE = if ($env:EXPENSES_TABLE) { $env:EXPENSES_TABLE } else { "ExpenseApprovals" }
$env:USERS_TABLE = if ($env:USERS_TABLE) { $env:USERS_TABLE } else { "UsersTable" }
$env:LOG_LEVEL = if ($env:LOG_LEVEL) { $env:LOG_LEVEL } else { "INFO" }

Write-Host ""
Write-Host "Configuration:" -ForegroundColor Cyan
Write-Host "  Storage Mode: AWS DynamoDB" -ForegroundColor White
Write-Host "  AWS Region: $env:AWS_REGION" -ForegroundColor White
Write-Host "  Expenses Table: $env:EXPENSES_TABLE" -ForegroundColor White
Write-Host "  Users Table: $env:USERS_TABLE" -ForegroundColor White
Write-Host ""

# Check if tables exist
Write-Host "Verifying DynamoDB tables exist..." -ForegroundColor Cyan
try {
    aws dynamodb describe-table --table-name $env:EXPENSES_TABLE --region $env:AWS_REGION 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "WARNING: Expenses table '$env:EXPENSES_TABLE' not found!" -ForegroundColor Yellow
        Write-Host "Run 'terraform apply' or 'scripts\setup-aws-tables.ps1' to create tables" -ForegroundColor Yellow
    } else {
        Write-Host "Expenses table found" -ForegroundColor Green
    }
} catch {
    Write-Host "WARNING: Could not verify expenses table" -ForegroundColor Yellow
}

try {
    aws dynamodb describe-table --table-name $env:USERS_TABLE --region $env:AWS_REGION 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "WARNING: Users table '$env:USERS_TABLE' not found!" -ForegroundColor Yellow
        Write-Host "Run 'terraform apply' or 'scripts\setup-aws-tables.ps1' to create tables" -ForegroundColor Yellow
    } else {
        Write-Host "Users table found" -ForegroundColor Green
    }
} catch {
    Write-Host "WARNING: Could not verify users table" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Starting backend server on port 5050..." -ForegroundColor Green
Write-Host "Press Ctrl+C to stop" -ForegroundColor Gray
Write-Host ""

npm start
