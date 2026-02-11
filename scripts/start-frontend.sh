#!/bin/bash

# Start SpendGuard frontend development server

set -e

cd frontend

echo "Installing frontend dependencies..."
npm install

echo "Starting frontend development server on port 3000..."
npm run dev
