#!/bin/bash

# Start SpendGuard backend server
# Ensures DynamoDB is running and tables are created

set -e

echo "Starting SpendGuard Backend..."

# Check if DynamoDB is running
if ! curl -s http://localhost:8000 > /dev/null 2>&1; then
    echo "Starting DynamoDB Local..."
    docker-compose up -d dynamodb-local
    sleep 3
fi

# Setup tables
echo "Setting up DynamoDB tables..."
export DYNAMODB_ENDPOINT=http://localhost:8000
export AWS_REGION=us-east-1
bash scripts/setup-dynamodb.sh

# Set environment variables
export USE_IN_MEMORY=false
export DYNAMODB_ENDPOINT=http://localhost:8000
export AWS_REGION=us-east-1
export LOG_LEVEL=INFO

# Start backend
echo "Starting backend server on port 5050..."
npm start
