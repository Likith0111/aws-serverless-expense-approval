# Setup AWS DynamoDB tables for SpendGuard (PowerShell)
# Creates UsersTable and ExpensesTable in AWS using AWS CLI
# Requires AWS credentials configured

$AWS_REGION = if ($env:AWS_REGION) { $env:AWS_REGION } else { "us-east-1" }

Write-Host "Setting up AWS DynamoDB tables in region $AWS_REGION..." -ForegroundColor Cyan
Write-Host ""

# Verify AWS credentials
try {
    $awsIdentity = aws sts get-caller-identity 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: AWS credentials not configured!" -ForegroundColor Red
        Write-Host "Please configure AWS credentials using:" -ForegroundColor Yellow
        Write-Host "  aws configure" -ForegroundColor Yellow
        exit 1
    }
    Write-Host "AWS Account:" -ForegroundColor Cyan
    Write-Host $awsIdentity -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "ERROR: AWS CLI not found or credentials not configured!" -ForegroundColor Red
    exit 1
}

# Create UsersTable
Write-Host "Creating UsersTable..." -ForegroundColor Cyan
$usersTableJson = @{
    TableName = "UsersTable"
    AttributeDefinitions = @(
        @{ AttributeName = "userId"; AttributeType = "S" }
        @{ AttributeName = "email"; AttributeType = "S" }
    )
    KeySchema = @(
        @{ AttributeName = "userId"; KeyType = "HASH" }
    )
    GlobalSecondaryIndexes = @(
        @{
            IndexName = "EmailIndex"
            KeySchema = @(
                @{ AttributeName = "email"; KeyType = "HASH" }
            )
            Projection = @{ ProjectionType = "ALL" }
        }
    )
    BillingMode = "PAY_PER_REQUEST"
    Tags = @(
        @{ Key = "Project"; Value = "SpendGuard" }
        @{ Key = "ManagedBy"; Value = "terraform" }
        @{ Key = "Environment"; Value = "production" }
    )
} | ConvertTo-Json -Depth 10

try {
    aws dynamodb create-table --region $AWS_REGION --cli-input-json $usersTableJson 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "UsersTable created successfully" -ForegroundColor Green
        Write-Host "Waiting for table to become active..." -ForegroundColor Yellow
        aws dynamodb wait table-exists --table-name UsersTable --region $AWS_REGION
    } else {
        Write-Host "UsersTable may already exist (checking...)" -ForegroundColor Yellow
        aws dynamodb describe-table --table-name UsersTable --region $AWS_REGION 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "UsersTable already exists" -ForegroundColor Green
        } else {
            Write-Host "ERROR: Failed to create UsersTable" -ForegroundColor Red
            exit 1
        }
    }
} catch {
    Write-Host "UsersTable already exists or error occurred" -ForegroundColor Yellow
}

Write-Host ""

# Create ExpensesTable
Write-Host "Creating ExpenseApprovals table..." -ForegroundColor Cyan
$expensesTableJson = @{
    TableName = "ExpenseApprovals"
    AttributeDefinitions = @(
        @{ AttributeName = "expenseId"; AttributeType = "S" }
        @{ AttributeName = "employeeId"; AttributeType = "S" }
    )
    KeySchema = @(
        @{ AttributeName = "expenseId"; KeyType = "HASH" }
    )
    GlobalSecondaryIndexes = @(
        @{
            IndexName = "EmployeeIndex"
            KeySchema = @(
                @{ AttributeName = "employeeId"; KeyType = "HASH" }
            )
            Projection = @{ ProjectionType = "ALL" }
        }
    )
    BillingMode = "PAY_PER_REQUEST"
    Tags = @(
        @{ Key = "Project"; Value = "SpendGuard" }
        @{ Key = "ManagedBy"; Value = "terraform" }
        @{ Key = "Environment"; Value = "production" }
    )
} | ConvertTo-Json -Depth 10

try {
    aws dynamodb create-table --region $AWS_REGION --cli-input-json $expensesTableJson 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "ExpenseApprovals table created successfully" -ForegroundColor Green
        Write-Host "Waiting for table to become active..." -ForegroundColor Yellow
        aws dynamodb wait table-exists --table-name ExpenseApprovals --region $AWS_REGION
    } else {
        Write-Host "ExpenseApprovals table may already exist (checking...)" -ForegroundColor Yellow
        aws dynamodb describe-table --table-name ExpenseApprovals --region $AWS_REGION 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "ExpenseApprovals table already exists" -ForegroundColor Green
        } else {
            Write-Host "ERROR: Failed to create ExpenseApprovals table" -ForegroundColor Red
            exit 1
        }
    }
} catch {
    Write-Host "ExpenseApprovals table already exists or error occurred" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "DynamoDB tables setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Tables created:" -ForegroundColor Cyan
Write-Host "  - UsersTable (PK: userId, GSI: EmailIndex)" -ForegroundColor White
Write-Host "  - ExpenseApprovals (PK: expenseId, GSI: EmployeeIndex)" -ForegroundColor White
Write-Host ""
Write-Host "Billing Mode: PAY_PER_REQUEST (on-demand)" -ForegroundColor Cyan
Write-Host "Free Tier: 25 WCU + 25 RCU always free" -ForegroundColor Green
