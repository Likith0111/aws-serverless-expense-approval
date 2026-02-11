# Setup DynamoDB Local tables for SpendGuard (PowerShell)
# This script creates UsersTable and ExpensesTable with proper GSIs

$DYNAMODB_ENDPOINT = if ($env:DYNAMODB_ENDPOINT) { $env:DYNAMODB_ENDPOINT } else { "http://localhost:8000" }
$AWS_REGION = if ($env:AWS_REGION) { $env:AWS_REGION } else { "us-east-1" }

Write-Host "Setting up DynamoDB tables at $DYNAMODB_ENDPOINT..." -ForegroundColor Cyan

# Create UsersTable
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
            ProvisionedThroughput = @{ ReadCapacityUnits = 5; WriteCapacityUnits = 5 }
        }
    )
    BillingMode = "PAY_PER_REQUEST"
} | ConvertTo-Json -Depth 10

try {
    aws dynamodb create-table --endpoint-url $DYNAMODB_ENDPOINT --region $AWS_REGION --cli-input-json $usersTableJson 2>$null
    Write-Host "UsersTable created" -ForegroundColor Green
} catch {
    Write-Host "UsersTable already exists" -ForegroundColor Yellow
}

# Create ExpensesTable
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
            ProvisionedThroughput = @{ ReadCapacityUnits = 5; WriteCapacityUnits = 5 }
        }
    )
    BillingMode = "PAY_PER_REQUEST"
} | ConvertTo-Json -Depth 10

try {
    aws dynamodb create-table --endpoint-url $DYNAMODB_ENDPOINT --region $AWS_REGION --cli-input-json $expensesTableJson 2>$null
    Write-Host "ExpenseApprovals table created" -ForegroundColor Green
} catch {
    Write-Host "ExpenseApprovals table already exists" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "DynamoDB tables created successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Tables:" -ForegroundColor Cyan
Write-Host "  - UsersTable (PK: userId, GSI: EmailIndex)"
Write-Host "  - ExpenseApprovals (PK: expenseId, GSI: EmployeeIndex)"
