#!/bin/bash

# Run all tests (backend + frontend)

set -e

echo "=========================================="
echo "Running Backend Tests"
echo "=========================================="
npm test

echo ""
echo "=========================================="
echo "Running Frontend Tests"
echo "=========================================="
cd frontend
npm install
npm test

echo ""
echo "=========================================="
echo "All tests completed!"
echo "=========================================="
