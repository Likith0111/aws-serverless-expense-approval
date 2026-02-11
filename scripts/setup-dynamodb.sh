#!/bin/bash

# Setup DynamoDB Local tables for SpendGuard
# This script creates UsersTable and ExpensesTable with proper GSIs

set -e

DYNAMODB_ENDPOINT="${DYNAMODB_ENDPOINT:-http://localhost:8000}"
AWS_REGION="${AWS_REGION:-us-east-1}"

echo "Setting up DynamoDB tables at $DYNAMODB_ENDPOINT..."

# Create UsersTable
aws dynamodb create-table \
  --endpoint-url "$DYNAMODB_ENDPOINT" \
  --region "$AWS_REGION" \
  --table-name UsersTable \
  --attribute-definitions \
    AttributeName=userId,AttributeType=S \
    AttributeName=email,AttributeType=S \
  --key-schema \
    AttributeName=userId,KeyType=HASH \
  --global-secondary-indexes \
    "[{\"IndexName\":\"EmailIndex\",\"KeySchema\":[{\"AttributeName\":\"email\",\"KeyType\":\"HASH\"}],\"Projection\":{\"ProjectionType\":\"ALL\"},\"ProvisionedThroughput\":{\"ReadCapacityUnits\":5,\"WriteCapacityUnits\":5}}]" \
  --billing-mode PAY_PER_REQUEST \
  2>/dev/null || echo "UsersTable already exists"

# Create ExpensesTable (if not exists from terraform)
aws dynamodb create-table \
  --endpoint-url "$DYNAMODB_ENDPOINT" \
  --region "$AWS_REGION" \
  --table-name ExpenseApprovals \
  --attribute-definitions \
    AttributeName=expenseId,AttributeType=S \
    AttributeName=employeeId,AttributeType=S \
  --key-schema \
    AttributeName=expenseId,KeyType=HASH \
  --global-secondary-indexes \
    "[{\"IndexName\":\"EmployeeIndex\",\"KeySchema\":[{\"AttributeName\":\"employeeId\",\"KeyType\":\"HASH\"}],\"Projection\":{\"ProjectionType\":\"ALL\"},\"ProvisionedThroughput\":{\"ReadCapacityUnits\":5,\"WriteCapacityUnits\":5}}]" \
  --billing-mode PAY_PER_REQUEST \
  2>/dev/null || echo "ExpenseApprovals table already exists"

echo "DynamoDB tables created successfully!"
echo ""
echo "Tables:"
echo "  - UsersTable (PK: userId, GSI: EmailIndex)"
echo "  - ExpenseApprovals (PK: expenseId, GSI: EmployeeIndex)"
