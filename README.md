# SpendGuard -- Intelligent Expense Approval Platform

A full-stack, enterprise-grade expense management platform demonstrating real-world AWS Lambda, Step Functions, **AWS DynamoDB**, and modern frontend engineering practices. Supports both local development (in-memory/Docker) and **real AWS DynamoDB** for production and integration testing.

**This project uses AWS DynamoDB for employee authentication and expense approval data storage.**

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Technology Stack](#technology-stack)
3. [Database Schema](#database-schema)
4. [Authentication Flow](#authentication-flow)
5. [Workflow Explanation](#workflow-explanation)
6. [API Reference](#api-reference)
7. [Frontend Features](#frontend-features)
8. [Testing Strategy](#testing-strategy)
9. [Local Run Instructions](#local-run-instructions)
10. [Project Structure](#project-structure)
11. [Free-Tier Justification](#free-tier-justification)
12. [Resume-Ready Highlights](#resume-ready-highlights)

---

## Architecture Overview

```
                         +------------------+
                         |   React Frontend |
                         |  (Vite + TS)     |
                         |  Port 3000       |
                         +--------+---------+
                                  |
                          HTTP (REST/JSON)
                                  |
                         +--------v---------+
                         |  Express Server  |
                         |  (API Gateway)   |
                         |  Port 5050       |
                         +--------+---------+
                                  |
              +-------------------+-------------------+
              |                                       |
     +--------v---------+                   +---------v--------+
     |  Auth Endpoints  |                   | Expense Endpoints|
     |  /auth/register  |                   | POST /expense    |
     |  /auth/login     |                   | GET  /expenses/* |
     +--------+---------+                   +---------+--------+
              |                                       |
              v                                       v
     +--------+---------+               +-------------+-------------+
     |  Users (in-mem)  |               |   Step Functions Workflow  |
     |  bcrypt + JWT    |               |   (Local Emulation)       |
     +------------------+               +--+-------+-------+-------+
                                           |       |       |       |
                                           v       v       v       v
                                       Validate  Policy  Fraud  Decision
                                       Expense   Check   Check  Handler
                                                                   |
                                                                   v
                                                          +--------+-------+
                                                          | DynamoDB       |
                                                          | (In-Memory or  |
                                                          |  Docker Local) |
                                                          +----------------+
```

**Key Design Decisions:**

- Express server simulates API Gateway + Lambda invocations locally
- Step Functions workflow is emulated with sequential handler calls and retry logic
- **DynamoDB supports three modes:**
  - **AWS mode**: Real AWS DynamoDB tables (production/integration testing)
  - **DynamoDB Local**: Docker-based local DynamoDB (persistent local dev)
  - **In-memory**: Map-based storage (fast unit tests, zero setup)
- JWT authentication with bcrypt password hashing replaces Cognito for free-tier safety
- Frontend stores JWT in-memory only (never in localStorage/cookies) for security
- **Environment-based switching**: Set `STORAGE_MODE=aws` to use real AWS DynamoDB

---

## Technology Stack

### Backend
| Component | Technology | Purpose |
|-----------|-----------|---------|
| Runtime | Node.js 18+ / TypeScript | Type-safe Lambda handlers |
| API Layer | Express.js | Local API Gateway simulation |
| Database | **AWS DynamoDB** (real AWS/local/in-memory) | Expense + User persistence |
| Auth | JWT + bcrypt | Stateless authentication |
| Workflow | Step Functions (local emulation) | Multi-step approval pipeline |
| Logging | Structured JSON | CloudWatch Logs Insights compatible |
| IaC | Terraform | AWS deployment definitions |

### Frontend
| Component | Technology | Purpose |
|-----------|-----------|---------|
| Framework | React 18 | Component-based UI |
| Language | TypeScript (strict mode) | Type safety |
| Build Tool | Vite | Fast HMR and builds |
| Styling | Tailwind CSS | Enterprise-grade UI |
| HTTP Client | Axios | API communication with interceptors |
| Routing | React Router v6 | SPA navigation + route guards |

### Testing
| Layer | Framework | Coverage |
|-------|-----------|----------|
| Backend Unit | Jest + ts-jest | All handlers, utils, models |
| Backend Integration | Jest | Full workflow pipeline |
| Backend Chaos | Jest | Failure injection + retry |
| Frontend Unit | Vitest + Testing Library | Components, pages, routes |

---

## Database Schema

### UsersTable

| Field | Type | Key | Description |
|-------|------|-----|-------------|
| userId | String | PK | UUID v4 |
| email | String | GSI (EmailIndex) | Lowercase, unique |
| passwordHash | String | -- | bcrypt hash (10 rounds) |
| role | String | -- | EMPLOYEE or MANAGER |
| employeeId | String | -- | Auto-generated EMP-XXXXXXXX |
| createdAt | String | -- | ISO 8601 timestamp |

### ExpensesTable

| Field | Type | Key | Description |
|-------|------|-----|-------------|
| expenseId | String | PK | Deterministic SHA-256 (EXP-XXXXXXXXXXXX) |
| employeeId | String | GSI (EmployeeIndex) | Employee who submitted |
| amount | Number | -- | USD amount |
| category | String | -- | One of 9 approved categories |
| description | String | -- | Free text (sanitized) |
| status | String | -- | APPROVED, REJECTED, NEEDS_MANUAL_REVIEW, PENDING_REVIEW, FAILED_PROCESSING |
| decisionReason | String | -- | Aggregated decision reasons |
| correlationId | String | -- | UUID v4 for distributed tracing |
| workflowVersion | String | -- | V1 or V2 |
| createdAt | String | -- | ISO 8601 timestamp |
| validation | Map | -- | Validation step result |
| policyCheck | Map | -- | Policy check step result |
| fraudCheck | Map | -- | Fraud heuristic step result |
| decision | Map | -- | Final decision with outcome and reasons |

**Approved Categories:** travel, meals, accommodation, office_supplies, software, training, client_entertainment, transportation, miscellaneous

---

## Authentication Flow

```
1. Client -> POST /auth/register { email, password, role }
   - Server validates input (email format, password >= 6 chars, role in [EMPLOYEE, MANAGER])
   - bcrypt hashes password (10 salt rounds)
   - Stores user record in UsersTable
   - Signs JWT with { id, email, role } (7-day expiry)
   - Returns { token, user }

2. Client -> POST /auth/login { email, password }
   - Looks up user by email (GSI query, case-insensitive)
   - Compares password with bcrypt
   - Signs and returns JWT

3. Client includes "Authorization: Bearer <token>" on all subsequent requests
   - Express middleware verifies JWT signature
   - Decoded user info attached to request object
   - 401 returned for missing/invalid tokens

4. Frontend stores token in React state (memory only)
   - Token is lost on page refresh (security requirement)
   - Axios interceptor auto-attaches token to all requests
   - 401/403 responses trigger automatic redirect to /login
```

**Security Measures:**
- Passwords never stored in plaintext
- JWT secret is configurable via environment variable
- No tokens in localStorage, sessionStorage, or cookies
- Input sanitization strips HTML/script tags at API boundary
- CORS enabled for local development

---

## Workflow Explanation

### V1 Workflow (Default)

```
Submit -> Validate -> Policy Check -> Fraud Heuristic -> Decision -> DynamoDB
                         |                  |                |
                   (with retry)       (with retry)    (compensation
                                       (3 attempts)     on failure)
```

### V2 Workflow (Manual Approval)

```
Submit -> Validate -> Policy Check -> Fraud Heuristic -> Decision
                                                            |
                                              +-------------+-------------+
                                              |             |             |
                                          APPROVED      REJECTED    NEEDS_REVIEW
                                              |             |             |
                                           DynamoDB      DynamoDB    PENDING_REVIEW
                                                                         |
                                                                  Wait for Human
                                                                         |
                                                              POST /manual-decision
                                                                         |
                                                                  APPROVED/REJECTED
```

### Step Details

1. **ValidateExpense** -- Stateless validation of required fields, amount bounds, category whitelist, description length, receipt boolean. Invalid claims short-circuit directly to REJECTED.

2. **PolicyCheck** (with retry, 2 attempts) -- Enforces per-category spending limits, receipt requirements above $25, and high-scrutiny category thresholds.

3. **FraudHeuristic** (with retry, 3 attempts) -- Rule-based fraud detection scoring system (0-100 points). Detects round amounts, threshold gaming, suspicious keywords, generic descriptions, missing receipts, and category-amount mismatches.

4. **Decision** -- Aggregates all check results and renders final outcome:
   - APPROVED: All checks passed, fraud risk LOW
   - REJECTED: Validation failed or hard limit exceeded
   - NEEDS_MANUAL_REVIEW: Soft policy violations or MEDIUM/HIGH fraud risk
   - FAILED_PROCESSING: Workflow error (compensation handler)

### Idempotency Strategy

Expense IDs are generated deterministically using SHA-256 of (employeeId + amount + category + description + date). Identical submissions produce the same ID, and DynamoDB conditional writes (attribute_not_exists) reject duplicates naturally.

### Chaos Engineering

When CHAOS_ENABLED=true, expenses with amounts ending in .13 trigger deterministic failures in FraudHeuristic. This exercises:
- Step Functions retry logic (exponential backoff)
- Catch block compensation handlers
- FAILED_PROCESSING persistence for audit trail

---

## API Reference

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /auth/register | No | Register a new user |
| POST | /auth/login | No | Authenticate and receive JWT |
| POST | /expense | Optional | Submit an expense claim |
| GET | /expense/:id | Optional | Get expense by ID |
| GET | /expenses/employee/:id | Optional | Get employee expenses (paginated) |
| GET | /expenses | No | List all expenses (local only) |
| POST | /expenses/:id/manual-decision | Optional | Manager manual review (local only) |
| DELETE | /expense/:id | No | Delete expense (local only) |
| GET | /swagger | No | Swagger UI documentation |
| GET | / | No | Health check |

---

## Frontend Features

### Pages
- **Login** -- Email/password form with error handling and link to registration
- **Register** -- Full registration form with role selection, password confirmation, optional employee ID
- **Dashboard** -- Enhanced analytics dashboard with:
  - Total expenses count and amount
  - Approved/rejected/pending statistics
  - Approval rate percentage
  - Recent expenses table with quick actions
  - Gradient cards with icons
  - Skeleton loaders for better UX
- **New Expense** -- Form with amount, category dropdown, description, receipt checkbox; client-side validation
- **My Expenses** -- Paginated expense list with status filters, load-more pagination, and view details links
- **Expense Details** -- Comprehensive expense view with:
  - Full expense information card
  - **Workflow timeline** showing all steps (Validation → Policy → Fraud → Decision)
  - Step-by-step status indicators with timestamps
  - Fraud analysis details and risk flags
  - Policy violation details
  - Visual timeline with icons and status colors
- **Review Expenses** (Manager only) -- Split-pane view: pending expenses list + decision form with fraud/policy details
- **404 Page** -- Clean not-found page with link back to dashboard

### UX Enhancements
- **Professional enterprise color palette** with gradient cards
- **Typography hierarchy** with clear font weights and sizes
- **Card-based dashboards** with shadow and border styling
- **Expense analytics summary** with totals, rates, and percentages
- **Timeline view** for expense workflow states with visual indicators
- **Status badges** with icons and color-coded states
- **Empty states** with helpful messages and call-to-action links
- **Skeleton loaders** for loading states
- **Accessibility-friendly forms** with proper labels and ARIA attributes
- Sidebar navigation with active state highlighting
- Role-based navigation (managers see "Review Expenses")
- Responsive layout with Tailwind CSS
- Form validation with inline error messages
- Loading states and success confirmations
- Error boundary for graceful crash handling

---

## Testing Strategy

### Backend Tests (101 tests, 10 suites)

**Unit Tests:**
- `validateExpense.test.ts` -- 14 tests covering all validation rules, edge cases, field-level errors
- `policyCheck.test.ts` -- 7 tests for spending limits, receipt requirements, scrutiny categories
- `fraudHeuristic.test.ts` -- 10 tests for all fraud detection heuristics and risk scoring
- `decision.test.ts` -- 10 tests for decision matrix, parallel state merging, idempotency
- `manualDecision.test.ts` -- 7 tests for manual approval/rejection flow
- `dynamo.test.ts` -- 9 tests for CRUD operations, pagination, duplicate blocking
- `auth.test.ts` -- 7 tests for user creation, email lookup, case-insensitive search
- `sanitize.test.ts` -- 12 tests for HTML stripping, XSS prevention, input normalization

**Integration Tests:**
- `endToEnd.test.ts` -- 13 tests: full workflow pipeline (APPROVED, REJECTED, MANUAL_REVIEW), negative cases, idempotency, pagination, compensation

**Chaos Tests:**
- `chaosResilience.test.ts` -- 6 tests: deterministic failure injection, retry behavior, FAILED_PROCESSING compensation, intermittent failure recovery

### Frontend Tests (29 tests, 8 suites)

- `StatusBadge.test.tsx` -- 5 tests for all status state rendering
- `ErrorBoundary.test.tsx` -- 2 tests for error catching and fallback UI
- `Sidebar.test.tsx` -- 4 tests for navigation, branding, user display
- `LoginPage.test.tsx` -- 2 tests for form rendering and validation
- `RegisterPage.test.tsx` -- 7 tests for form, role selector, password validation
- `DashboardPage.test.tsx` -- 4 tests for stats, welcome message, expense table
- `NotFoundPage.test.tsx` -- 3 tests for 404 display and navigation
- `ProtectedRoute.test.tsx` -- 2 tests for auth guard behavior

### Running Tests

```bash
# All tests (backend + frontend)
npm test

# Backend only
npm run test:unit
npm run test:integration
npm run test:chaos

# Frontend only
cd frontend && npx vitest run
```

---

## Local & AWS Run Instructions

### Prerequisites

- Node.js 18+ and npm
- Docker (optional, for DynamoDB Local persistence)
- AWS CLI (for AWS mode)
- AWS credentials configured (for AWS mode)

### Quick Start (In-Memory Mode - Zero Setup)

```bash
# 1. Install backend dependencies
npm install

# 2. Install frontend dependencies
cd frontend && npm install && cd ..

# 3. Run all tests (local mode)
npm test

# 4. Start backend server (port 5050, in-memory mode)
npm start

# 5. Start frontend dev server (port 3000, separate terminal)
cd frontend && npm run dev
```

### With DynamoDB Local (Docker - Persistent Storage)

```bash
# 1. Start DynamoDB Local
docker-compose up -d

# 2. Create tables
# PowerShell:
.\scripts\setup-dynamodb.ps1
# Bash:
./scripts/setup-dynamodb.sh

# 3. Start backend with DynamoDB Local
# PowerShell:
.\scripts\start-backend.ps1
# Bash:
./scripts/start-backend.sh

# 4. Start frontend (separate terminal)
cd frontend && npm run dev
```

### With Real AWS DynamoDB (Production/Integration Testing)

**IMPORTANT: This uses REAL AWS DynamoDB. Ensure you have AWS credentials configured.**

```bash
# 1. Configure AWS credentials
aws configure
# OR set environment variables:
# export AWS_ACCESS_KEY_ID=your-key
# export AWS_SECRET_ACCESS_KEY=your-secret

# 2. Create tables in AWS (one-time setup)
# PowerShell:
.\scripts\setup-aws-tables.ps1
# Bash:
aws dynamodb create-table ... (see scripts/setup-aws-tables.sh)

# OR use Terraform:
cd terraform
terraform init
terraform plan
terraform apply

# 3. Start backend in AWS mode
# PowerShell:
.\scripts\start-backend-aws.ps1
# Bash:
STORAGE_MODE=aws npm start

# 4. Start frontend (separate terminal)
cd frontend && npm run dev
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| **STORAGE_MODE** | `local` | `local` (in-memory), `dynamodb-local` (Docker), or `aws` (real AWS) |
| USE_IN_MEMORY | `false` | Deprecated: use STORAGE_MODE instead |
| DYNAMODB_ENDPOINT | -- | DynamoDB Local endpoint (e.g. http://localhost:8000) |
| AWS_REGION | `us-east-1` | AWS region for DynamoDB |
| EXPENSES_TABLE | `ExpenseApprovals` | DynamoDB table name for expenses |
| USERS_TABLE | `UsersTable` | DynamoDB table name for users |
| LOCAL_PORT | `5050` | Backend server port |
| WORKFLOW_VERSION | `V1` | V1 (auto) or V2 (manual approval) |
| CHAOS_ENABLED | `false` | Enable deterministic failure injection |
| LOG_LEVEL | `INFO` | DEBUG, INFO, WARN, ERROR |
| JWT_SECRET | `local-dev-secret-change-in-production` | JWT signing secret |
| VITE_API_URL | `http://localhost:5050` | Frontend API base URL |

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| USE_IN_MEMORY | true | Use in-memory store (bypass DynamoDB) |
| DYNAMODB_ENDPOINT | -- | DynamoDB Local endpoint URL |
| LOCAL_PORT | 5050 | Backend server port |
| WORKFLOW_VERSION | V1 | V1 (auto) or V2 (manual approval) |
| CHAOS_ENABLED | false | Enable deterministic failure injection |
| LOG_LEVEL | INFO | DEBUG, INFO, WARN, ERROR |
| JWT_SECRET | local-dev-secret-change-in-production | JWT signing secret |
| VITE_API_URL | http://localhost:5050 | Frontend API base URL |

### Quick Test Workflow

```bash
# Register an employee
curl -X POST http://localhost:5050/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"employee@test.com","password":"password123","role":"EMPLOYEE"}'

# Register a manager
curl -X POST http://localhost:5050/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"manager@test.com","password":"password123","role":"MANAGER"}'

# Submit an expense
curl -X POST http://localhost:5050/expense \
  -H "Content-Type: application/json" \
  -d '{"employeeId":"EMP-001","amount":45.00,"category":"meals","description":"Team lunch at downtown restaurant","receiptProvided":true}'

# List all expenses
curl http://localhost:5050/expenses

# Get expenses by employee
curl http://localhost:5050/expenses/employee/EMP-001
```

---

## Project Structure

```
AWS Project/
  package.json              # Backend dependencies and scripts
  tsconfig.json             # Backend TypeScript config
  jest.config.js            # Jest test configuration
  docker-compose.yml        # DynamoDB Local service
  src/
    handlers/               # Lambda-style handlers
      validateExpense.ts    # Input validation (Step 1)
      policyCheck.ts        # Corporate policy enforcement (Step 2a)
      fraudHeuristic.ts     # Fraud risk scoring (Step 2b)
      decision.ts           # Final decision + DynamoDB persistence (Step 3)
      submitExpense.ts      # API Gateway Lambda handler
      manualDecision.ts     # Human reviewer decision handler
    models/
      expense.ts            # TypeScript interfaces and types
    utils/
      config.ts             # Centralized configuration (single env access point)
      dynamo.ts             # DynamoDB client (in-memory + real)
      users-dynamo.ts       # User table operations
      idgen.ts              # Deterministic SHA-256 expense ID generator
      logger.ts             # Structured JSON logger
      sanitize.ts           # XSS prevention and input cleaning
    local/
      server.ts             # Express development server
  frontend/
    package.json            # Frontend dependencies
    vite.config.ts          # Vite build configuration
    vitest.config.ts        # Vitest test configuration
    tailwind.config.js      # Tailwind CSS theme
    src/
      App.tsx               # Root component with routing
      main.tsx              # Entry point
      index.css             # Tailwind directives + custom components
      types.ts              # Shared TypeScript types
      context/
        AuthContext.tsx      # JWT auth state management
      services/
        api.ts              # Axios client with interceptors
      components/
        Sidebar.tsx          # Navigation sidebar
        StatusBadge.tsx      # Color-coded status indicator
        ErrorBoundary.tsx    # Global error handler
      pages/
        LoginPage.tsx        # Sign in form
        RegisterPage.tsx     # Registration form
        DashboardPage.tsx    # Overview with stats
        NewExpensePage.tsx   # Expense submission form
        MyExpensesPage.tsx   # Employee expense list
        ReviewExpensesPage.tsx # Manager review interface
        NotFoundPage.tsx     # 404 page
      routes/
        ProtectedRoute.tsx   # Auth guard wrapper
        ManagerRoute.tsx     # Manager role guard wrapper
  tests/
    setup.ts                # Jest global environment setup
    unit/                   # Unit tests for all handlers and utilities
    integration/            # End-to-end workflow tests
    chaos/                  # Failure injection and resilience tests
  terraform/                # AWS infrastructure definitions
    main.tf, lambda.tf, api_gateway.tf, step_functions.tf,
    dynamodb.tf, iam.tf, variables.tf, outputs.tf
  statemachine/
    expense_workflow.asl.json     # V1 ASL definition
    expense_workflow_v2.asl.json  # V2 ASL with manual approval
  scripts/                  # Automation scripts (PowerShell + Bash)
  swagger/
    openapi.yaml            # OpenAPI 3.0 specification
```

---

## Free-Tier Justification

This application is designed to be 100% AWS Free Tier safe:

| Service | Free Tier Allocation | SpendGuard Usage | Safe? |
|---------|---------------------|------------------|-------|
| **DynamoDB** | **25 GB storage, 25 RCU/WCU always free** | **2 tables (UsersTable, ExpenseApprovals), on-demand billing** | **Yes** |
| Lambda | 1M requests/month, 400K GB-sec | 5 functions, minimal invocations | Yes |
| Step Functions | 4,000 state transitions/month | Low volume workflow | Yes |
| API Gateway | 1M REST API calls/month | Low volume API | Yes |
| CloudWatch Logs | 5 GB ingestion/month | Structured JSON logs | Yes |

### AWS DynamoDB Usage

**This project uses REAL AWS DynamoDB for:**
- **User authentication data** (UsersTable)
- **Expense records** (ExpenseApprovals table)
- **Approval decisions** and workflow metadata
- **Employee expense queries** via GSI

**Free Tier Coverage:**
- On-demand billing (PAY_PER_REQUEST) eliminates capacity planning
- 25 WCU + 25 RCU always free (covers low-volume testing)
- 25 GB storage always free
- No base cost - pay only for actual reads/writes beyond free tier

**Cost Optimization:**
- Uses Query (not Scan) for all access patterns
- Conditional writes prevent duplicate operations
- Efficient GSI design (EmailIndex, EmployeeIndex)
- Test-safe prefixes (TEST_*) for integration tests

**Local development options:**
- **In-memory mode**: Zero AWS resources, instant startup
- **DynamoDB Local**: Docker-based, persistent storage, no AWS costs
- **AWS mode**: Real DynamoDB for production/integration testing

**No paid services used:**
- No Cognito (JWT + bcrypt instead)
- No S3 (no file uploads)
- No RDS (DynamoDB only)
- No ElastiCache (in-memory state)
- No external SaaS dependencies

---

## Resume-Ready Highlights

- Architected and implemented a full-stack expense management system using AWS serverless patterns (Lambda, Step Functions, **AWS DynamoDB**, API Gateway) with **real AWS DynamoDB integration** and complete local development emulation
- Designed a multi-step approval workflow with parallel execution, retry logic with exponential backoff, compensation handlers, and chaos engineering support for resilience testing
- Built a production-grade React 18 frontend with TypeScript strict mode, Tailwind CSS enterprise UI, role-based access control, JWT in-memory authentication, and protected routing
- Implemented deterministic idempotency using SHA-256 content hashing combined with DynamoDB conditional writes, eliminating the need for separate deduplication infrastructure
- Created comprehensive test coverage (130 tests across 18 suites) spanning unit, integration, chaos/resilience, and component testing with Jest and Vitest
- Applied enterprise security practices: bcrypt password hashing, JWT with no browser storage, input sanitization against XSS, CORS configuration, and least-privilege IAM policies
- Developed structured JSON logging compatible with CloudWatch Logs Insights for production observability
- Defined complete Terraform infrastructure-as-code for repeatable AWS deployment with proper IAM roles, API Gateway integration, and Step Functions state machine definitions
- Engineered a dual-version workflow system (V1 automated, V2 human-in-the-loop) demonstrating extensible state machine design
- Implemented **environment-based storage switching** (local/in-memory/Docker/AWS) enabling seamless transition between development and production
- Maintained zero-cost local development using DynamoDB Local Docker and in-memory fallbacks with no AWS credentials required
- **Built AWS integration test suite** that runs against real DynamoDB with test-safe prefixes and proper cleanup
- **Enhanced frontend UI** with analytics dashboard, workflow timeline visualization, gradient cards, skeleton loaders, and enterprise-grade styling
