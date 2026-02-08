# Serverless Intelligent Expense Approval Workflow

## Project Overview

This project implements a production-grade serverless backend system that processes employee expense claims using AWS Lambda and AWS Step Functions. The system validates expense structure, enforces corporate spending policies, applies rule-based fraud detection heuristics, and automatically renders approval decisions -- all without human intervention for routine claims.

The entire codebase is written in TypeScript, infrastructure is managed with Terraform, and the architecture runs within AWS Free Tier limits.

---

## Architecture

```
                                    +-------------------+
                                    |  Amazon API       |
                                    |  Gateway (HTTP)   |
                                    +--------+----------+
                                             |
                                    POST /expense
                                             |
                                             v
                                    +--------+----------+
                                    | SubmitExpense     |
                                    | Lambda            |
                                    +--------+----------+
                                             |
                                  StartExecution()
                                             |
                                             v
                              +--------------+--------------+
                              |   AWS Step Functions        |
                              |   Standard Workflow         |
                              |                             |
                              |  +------------------------+ |
                              |  |  1. ValidateExpense    | |
                              |  +----------+-------------+ |
                              |             |               |
                              |         valid?              |
                              |          /    \             |
                              |        NO      YES          |
                              |        |        |           |
                              |        v        v           |
                              |   +--------+  +---------+  |
                              |   |Reject  |  |Parallel |  |
                              |   |Decision|  |State    |  |
                              |   +--------+  |         |  |
                              |               |+-------+|  |
                              |               ||Policy ||  |
                              |               ||Check  ||  |
                              |               |+-------+|  |
                              |               |         |  |
                              |               |+-------+|  |
                              |               ||Fraud  ||  |
                              |               ||Check  ||  |
                              |               |+-------+|  |
                              |               +---------+  |
                              |                   |        |
                              |                   v        |
                              |  +------------------------+|
                              |  |  4. MakeDecision       ||
                              |  +------------------------+|
                              +--------------+--------------+
                                             |
                                             v
                                    +--------+----------+
                                    |  Amazon DynamoDB  |
                                    |  (Results Store)  |
                                    +-------------------+
```

### Request Flow

1. A client submits a POST request with an expense claim to API Gateway.
2. The SubmitExpense Lambda generates a unique expense ID and starts a Step Functions execution.
3. The state machine runs four Lambda functions in a structured pipeline.
4. The final decision (APPROVED, REJECTED, or NEEDS_MANUAL_REVIEW) is persisted to DynamoDB.
5. The client can retrieve the result via GET /expense/{expenseId}.

---

## Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| Language | TypeScript | Type safety, excellent AWS SDK v3 support, strong ecosystem |
| Runtime | Node.js 20.x | AWS SDK v3 included in Lambda runtime, fast cold starts |
| IaC | Terraform | Cloud-agnostic, declarative, mature state management, widely adopted |
| Testing | Jest + ts-jest | First-class TypeScript support, fast parallel execution |
| Local Dev | Express + Swagger UI | Simulates full workflow locally on port 5050 |

---

## AWS Services Used

| Service | Role | Why This Service | Free Tier |
|---|---|---|---|
| AWS Lambda | Executes business logic for each workflow step | Zero idle cost, sub-second cold starts, auto-scaling | 1M requests + 400K GB-seconds/month |
| AWS Step Functions (Standard) | Orchestrates the multi-step approval workflow | Visual workflow, retry/error handling, 4K free transitions | 4,000 state transitions/month |
| Amazon API Gateway (HTTP API) | REST endpoint for expense submission and retrieval | 71% cheaper than REST API, lower latency | 1M calls/month (first 12 months) |
| Amazon DynamoDB (On-Demand) | Stores expense records and approval decisions | Zero capacity planning, pay-per-request | 25 GB + 25 RCU/WCU |
| Amazon CloudWatch | Lambda logging and API Gateway access logs | Automatic Lambda integration, retention policies | 5 GB log ingestion/month |
| AWS IAM | Least-privilege access control | Always free, security best practice | Always free |

### Why Terraform Over SAM / CDK / Serverless Framework

- **Cloud-agnostic**: Terraform skills transfer to any cloud provider, not just AWS.
- **Mature state management**: Remote state locking, import, drift detection.
- **Declarative and explicit**: Every resource and permission is visible in HCL.
- **Industry standard**: Most widely used IaC tool in production environments.
- **No build-time dependencies**: Does not require Docker, Node.js, or Java (unlike CDK/SAM).

---

## Step Functions Workflow

The state machine (`statemachine/expense_workflow.asl.json`) orchestrates four Lambda functions:

### Step 1: ValidateExpense

Validates all required fields, data types, value ranges, and allowed categories. If validation fails, the workflow short-circuits directly to the Decision Lambda via a Choice state.

### Step 2: Parallel Checks (PolicyCheck + FraudHeuristic)

These two checks run concurrently in a Parallel state:

**PolicyCheck** evaluates:
- Category-specific spending limits (e.g., meals capped at $75)
- Receipt requirements (mandatory for expenses over $25)
- High-scrutiny thresholds for sensitive categories

**FraudHeuristic** applies deterministic rules:
- Suspiciously round dollar amounts ($500.00 exactly)
- Threshold gaming ($24.99, just below the $25 receipt limit)
- Suspicious keywords ("test", "fake", "n/a")
- Very short or generic descriptions
- High amounts without receipts
- Category-amount mismatches

Each rule adds points to a risk score (0-100) mapped to LOW/MEDIUM/HIGH.

### Step 3: MakeDecision

| Condition | Decision |
|---|---|
| Validation failed | REJECTED |
| Amount exceeds category limit | REJECTED |
| Policy violations or MEDIUM/HIGH fraud risk | NEEDS_MANUAL_REVIEW |
| All checks passed, LOW fraud risk | APPROVED |

### Error Handling

Every Task state includes retry logic with exponential backoff and a catch-all fallback to a Fail state.

---

## Project Structure

```
AWS Project/
|-- package.json                      # Dependencies and npm scripts
|-- tsconfig.json                     # TypeScript compiler configuration
|-- jest.config.ts                    # Jest test runner configuration
|-- terraform/                        # Infrastructure-as-Code (Terraform)
|   |-- main.tf                       # Provider and backend config
|   |-- variables.tf                  # Input variables
|   |-- outputs.tf                    # Stack outputs
|   |-- lambda.tf                     # Lambda functions + deployment ZIP
|   |-- api_gateway.tf                # HTTP API Gateway
|   |-- step_functions.tf             # Step Functions state machine
|   |-- dynamodb.tf                   # DynamoDB table
|   +-- iam.tf                        # IAM roles and policies
|-- statemachine/
|   +-- expense_workflow.asl.json     # Step Functions ASL definition
|-- src/
|   |-- handlers/
|   |   |-- submitExpense.ts          # API Gateway handler (POST/GET)
|   |   |-- validateExpense.ts        # Workflow step 1: Validation
|   |   |-- policyCheck.ts            # Workflow step 2a: Policy rules
|   |   |-- fraudHeuristic.ts         # Workflow step 2b: Fraud detection
|   |   +-- decision.ts              # Workflow step 3: Final decision
|   |-- models/
|   |   +-- expense.ts               # TypeScript interfaces and types
|   |-- utils/
|   |   |-- dynamo.ts                # DynamoDB abstraction layer
|   |   +-- config.ts                # Environment configuration
|   +-- local/
|       +-- server.ts                # Express local development server
|-- swagger/
|   +-- openapi.yaml                 # OpenAPI 3.0 specification
|-- tests/
|   |-- setup.ts                     # Jest global environment setup
|   |-- unit/
|   |   |-- validateExpense.test.ts
|   |   |-- policyCheck.test.ts
|   |   |-- fraudHeuristic.test.ts
|   |   +-- decision.test.ts
|   +-- integration/
|       +-- endToEnd.test.ts         # Full pipeline integration tests
|-- docker-compose.yml               # Optional DynamoDB Local
+-- README.md
```

---

## How to Run Locally

### Prerequisites

- Node.js 18 or later
- npm

### Setup

```bash
cd "AWS Project"

# Install dependencies
npm install
```

### Start the Local Server

```bash
npm start
```

The server starts on **http://localhost:5050** with:

| URL | Description |
|---|---|
| http://localhost:5050/expense | POST: submit expense claim |
| http://localhost:5050/expense/{id} | GET: retrieve decision |
| http://localhost:5050/expenses | GET: list all (dev only) |
| http://localhost:5050/swagger | Interactive Swagger UI |
| http://localhost:5050/ | Health check |

No AWS credentials, Docker, or external services are required. The server uses in-memory storage.

### Submit a Test Expense

```bash
curl -X POST http://localhost:5050/expense ^
  -H "Content-Type: application/json" ^
  -d "{\"employeeId\":\"EMP-001\",\"amount\":45,\"category\":\"meals\",\"description\":\"Team lunch at downtown restaurant\",\"receiptProvided\":true}"
```

### Run Tests

All tests run locally with a single command:

```bash
npm test
```

This executes unit tests (individual handlers) and integration tests (full workflow pipeline). No AWS credentials required.

---

## How to Deploy (Optional)

```bash
# 1. Compile TypeScript to JavaScript
npm run build

# 2. Initialize Terraform
cd terraform
terraform init

# 3. Preview changes
terraform plan

# 4. Deploy
terraform apply
```

---

## Sample API Request and Response

### POST /expense -- APPROVED

**Request:**

```json
{
  "employeeId": "EMP-001",
  "amount": 45.00,
  "category": "meals",
  "description": "Team lunch at downtown restaurant",
  "receiptProvided": true
}
```

**Response (202):**

```json
{
  "message": "Expense claim submitted and processed successfully",
  "expenseId": "EXP-3F8A1B2C4D5E",
  "submittedAt": "2026-02-08T15:30:00.000Z",
  "status": "APPROVED"
}
```

### POST /expense -- REJECTED

```json
{
  "employeeId": "EMP-002",
  "amount": 500.00,
  "category": "meals",
  "description": "Executive dinner at five-star restaurant",
  "receiptProvided": true
}
```

**Response (202):** `"status": "REJECTED"`

### POST /expense -- NEEDS_MANUAL_REVIEW

```json
{
  "employeeId": "EMP-003",
  "amount": 24.99,
  "category": "miscellaneous",
  "description": "test expense",
  "receiptProvided": false
}
```

**Response (202):** `"status": "NEEDS_MANUAL_REVIEW"`

### GET /expense/{expenseId}

**Response (200):**

```json
{
  "expenseId": "EXP-3F8A1B2C4D5E",
  "employeeId": "EMP-001",
  "amount": 45.00,
  "category": "meals",
  "description": "Team lunch at downtown restaurant",
  "receiptProvided": true,
  "submittedAt": "2026-02-08T15:30:00.000Z",
  "validation": {
    "passed": true,
    "errors": [],
    "validatedAt": "2026-02-08T15:30:00.000Z"
  },
  "policyCheck": {
    "passed": true,
    "violations": [],
    "checkedAt": "2026-02-08T15:30:00.000Z"
  },
  "fraudCheck": {
    "riskScore": 0,
    "riskLevel": "LOW",
    "riskFlags": [],
    "analyzedAt": "2026-02-08T15:30:00.000Z"
  },
  "decision": {
    "outcome": "APPROVED",
    "reasons": ["All validation, policy, and fraud checks passed"],
    "decidedAt": "2026-02-08T15:30:00.000Z"
  },
  "status": "APPROVED"
}
```

---

## Free Tier Compliance

| Service | Free Tier Limit | Project Usage |
|---|---|---|
| Lambda | 1M requests/month | Demo-level: under 100 invocations/month |
| Step Functions | 4,000 transitions/month | ~6 transitions per workflow; supports ~650 expenses/month |
| API Gateway | 1M requests/month | Under 100 requests/month |
| DynamoDB | 25 WCU + 25 RCU | 1 write per expense; negligible read volume |
| CloudWatch | 5 GB logs/month | Minimal structured logging; 14-day retention |

### Cost Controls

- All Lambda functions use 128 MB memory (minimum) and 15-second timeout.
- DynamoDB uses on-demand billing with zero base cost.
- Standard Step Functions (not Express) chosen for 4,000 free transitions.
- CloudWatch log groups have explicit retention (14 days) to prevent unbounded growth.
- No scheduled executions, polling, NAT Gateway, VPC, or hourly-billed services.

---

## Resume Bullet Points

- Designed and implemented a serverless expense approval workflow using AWS Lambda, Step Functions, API Gateway, and DynamoDB with TypeScript, demonstrating full-stack cloud architecture skills.

- Provisioned all AWS infrastructure using Terraform with modular HCL files, least-privilege IAM policies, and parameterized resource configurations.

- Built a multi-step Step Functions state machine with parallel execution branches, conditional branching, and automatic retry with exponential backoff using Amazon States Language.

- Developed rule-based fraud detection heuristics scoring expenses across six independent risk dimensions, producing actionable risk levels for automated decision-making.

- Implemented a three-tier decision engine (APPROVED / REJECTED / NEEDS_MANUAL_REVIEW) aggregating validation, policy compliance, and fraud analysis results.

- Designed the system to operate entirely within AWS Free Tier limits by selecting cost-optimized service configurations (HTTP API v2, Standard Workflows, On-Demand DynamoDB, 128 MB Lambda).

- Created a local development server using Express and Swagger UI that simulates the full Step Functions workflow without AWS credentials or Docker, enabling rapid iteration.

- Achieved comprehensive test coverage with Jest across unit tests (4 handlers) and integration tests (full pipeline), runnable with a single `npm test` command.
#   a w s - s e r v e r l e s s - e x p e n s e - a p p r o v a l  
 