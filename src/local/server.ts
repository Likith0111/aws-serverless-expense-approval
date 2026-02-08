/**
 * Local development server for the Expense Approval Workflow.
 *
 * Runs an Express application on port 5050 that simulates the complete
 * Step Functions workflow without requiring AWS credentials, Docker,
 * or any external services.
 *
 * How it works:
 *   Instead of invoking Lambda functions through Step Functions, this
 *   server chains the handler functions directly. The business logic
 *   is identical -- only the orchestration layer differs.
 *
 * Endpoints:
 *   POST /expense            Submit and process an expense claim
 *   GET  /expense/:id        Retrieve a processed expense record
 *   GET  /expenses           List all processed expenses (dev only)
 *   GET  /swagger            Interactive Swagger UI
 *   GET  /                   Health check
 */

import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import * as yaml from "js-yaml";
import * as fs from "fs";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";

import { handler as validateHandler } from "../handlers/validateExpense";
import { handler as policyHandler } from "../handlers/policyCheck";
import { handler as fraudHandler } from "../handlers/fraudHeuristic";
import { handler as decisionHandler } from "../handlers/decision";
import { getExpense, getInMemoryStore } from "../utils/dynamo";
import { ExpenseEvent, ExpenseClaimRequest } from "../models/expense";

// ---------------------------------------------------------------------------
// Environment setup (must happen before any handler imports use it)
// ---------------------------------------------------------------------------

process.env.USE_IN_MEMORY = "true";
process.env.AWS_REGION ??= "us-east-1";

// ---------------------------------------------------------------------------
// Express application
// ---------------------------------------------------------------------------

const app = express();
app.use(cors());
app.use(express.json());

// ---------------------------------------------------------------------------
// Swagger UI at /swagger
// ---------------------------------------------------------------------------

const swaggerPath = path.join(__dirname, "../../swagger/openapi.yaml");
let swaggerDocument: Record<string, unknown> = {};
try {
  swaggerDocument = yaml.load(fs.readFileSync(swaggerPath, "utf8")) as Record<
    string,
    unknown
  >;
} catch {
  console.warn("Could not load OpenAPI spec from swagger/openapi.yaml");
}

app.use("/swagger", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/** Health check. */
app.get("/", (_req, res) => {
  res.json({
    service: "expense-approval-workflow",
    status: "healthy",
    mode: "local-development",
    timestamp: new Date().toISOString(),
  });
});

/** Submit an expense claim and run the approval workflow. */
app.post("/expense", async (req, res) => {
  try {
    const body = req.body as Partial<ExpenseClaimRequest>;

    // Validate required fields at the API boundary.
    const required: (keyof ExpenseClaimRequest)[] = [
      "employeeId",
      "amount",
      "category",
      "description",
      "receiptProvided",
    ];
    const missing = required.filter((f) => !(f in body));
    if (missing.length > 0) {
      res.status(400).json({
        error: `Missing required fields: ${missing.join(", ")}`,
      });
      return;
    }

    const expenseId = `EXP-${uuidv4().replace(/-/g, "").substring(0, 12).toUpperCase()}`;
    const submittedAt = new Date().toISOString();

    const workflowInput: ExpenseEvent = {
      expenseId,
      employeeId: body.employeeId!,
      amount: Number(body.amount),
      category: body.category!,
      description: body.description!,
      receiptProvided: Boolean(body.receiptProvided),
      submittedAt,
    };

    // Run the workflow synchronously (simulates Step Functions).
    const result = await runWorkflow(workflowInput);

    res.status(202).json({
      message: "Expense claim submitted and processed successfully",
      expenseId,
      submittedAt,
      status: result.status ?? "UNKNOWN",
    });
  } catch (err) {
    console.error("Workflow execution failed:", err);
    res.status(500).json({ error: `Workflow execution failed: ${err}` });
  }
});

/** Retrieve an expense record by ID. */
app.get("/expense/:expenseId", async (req, res) => {
  const { expenseId } = req.params;
  const record = await getExpense(expenseId);

  if (!record) {
    res.status(404).json({ error: `Expense ${expenseId} not found` });
    return;
  }

  res.json(record);
});

/** List all expenses (local development only). */
app.get("/expenses", (_req, res) => {
  const store = getInMemoryStore();
  res.json({
    expenses: [...store.values()],
    count: store.size,
  });
});

// ---------------------------------------------------------------------------
// Workflow simulation (mirrors Step Functions ASL)
// ---------------------------------------------------------------------------

async function runWorkflow(input: ExpenseEvent): Promise<ExpenseEvent> {
  const ctx = {};

  // Step 1: Validate
  let result = await validateHandler(input, ctx);

  // Step 2: Short-circuit if invalid (mirrors Choice state)
  if (!result.validation?.passed) {
    result = await decisionHandler(result, ctx);
    return result;
  }

  // Step 3: Policy Check (sequential locally; parallel in production)
  result = await policyHandler(result, ctx);

  // Step 4: Fraud Heuristic
  result = await fraudHandler(result, ctx);

  // Step 5: Decision
  result = await decisionHandler(result, ctx);

  return result;
}

// ---------------------------------------------------------------------------
// Server startup
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.LOCAL_PORT ?? "5050", 10);

app.listen(PORT, () => {
  console.log("=".repeat(60));
  console.log("  Expense Approval Workflow - Local Development Server");
  console.log("=".repeat(60));
  console.log();
  console.log(`  API endpoint:  http://localhost:${PORT}/expense`);
  console.log(`  Swagger UI:    http://localhost:${PORT}/swagger`);
  console.log(`  Health check:  http://localhost:${PORT}/`);
  console.log(`  List expenses: http://localhost:${PORT}/expenses`);
  console.log();
  console.log("  Storage mode:  In-memory (no DynamoDB required)");
  console.log("  Press Ctrl+C to stop the server.");
  console.log("=".repeat(60));
});

export { app, runWorkflow };
