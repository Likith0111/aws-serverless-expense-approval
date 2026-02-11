/**
 * Local development server for the Expense Approval Workflow.
 *
 * Simulates the complete AWS architecture locally:
 *   - API Gateway       -> Express routes
 *   - Step Functions     -> runWorkflow() function with retry logic
 *   - Lambda invocations -> Direct handler function calls
 *   - DynamoDB           -> In-memory Map
 *
 * Endpoints:
 *   POST   /expense                              Submit expense claim
 *   GET    /expense/:id                          Get expense by ID
 *   GET    /expenses/employee/:id                Get expenses by employee (paginated)
 *   POST   /expenses/:id/manual-decision         Manual review decision (local only)
 *   DELETE /expense/:id                          Delete expense (local only)
 *   GET    /expenses                             List all expenses (local only)
 *   GET    /swagger                              Swagger UI
 *   GET    /                                     Health check
 *
 * Workflow versioning:
 *   V1: Validate -> Parallel(Policy, Fraud) -> Decision -> End
 *   V2: Same as V1 but NEEDS_MANUAL_REVIEW enters PENDING_REVIEW state,
 *       waiting for POST /expenses/:id/manual-decision to finalize.
 */

import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import * as yaml from "js-yaml";
import * as fs from "fs";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

import { handler as validateHandler } from "../handlers/validateExpense";
import { handler as policyHandler } from "../handlers/policyCheck";
import { handler as fraudHandler } from "../handlers/fraudHeuristic";
import { handler as decisionHandler } from "../handlers/decision";
import { handleManualDecision } from "../handlers/manualDecision";
import {
  getExpense,
  getExpensesByEmployee,
  getInMemoryStore,
  deleteExpense,
} from "../utils/dynamo";
import { config } from "../utils/config";
import { createLogger } from "../utils/logger";
import { sanitizeExpenseInput } from "../utils/sanitize";
import { generateExpenseId } from "../utils/idgen";
import { ExpenseEvent, ExpenseClaimRequest, ManualDecisionRequest } from "../models/expense";

// ---------------------------------------------------------------------------
// Environment setup
// ---------------------------------------------------------------------------
// Note: import statements are hoisted and evaluated before this code runs.
// config.ts computes its values at import time from process.env, so we must
// also set the config property directly to ensure in-memory mode is active.

process.env.USE_IN_MEMORY = "true";
process.env.AWS_REGION ??= "us-east-1";
(config as Record<string, unknown>).useInMemory = true;

const log = createLogger("LocalServer");

// ---------------------------------------------------------------------------
// Express application
// ---------------------------------------------------------------------------

const app = express();
app.use(cors());
app.use(express.json());

// ---------------------------------------------------------------------------
// Swagger UI
// ---------------------------------------------------------------------------

const swaggerPath = path.join(__dirname, "../../swagger/openapi.yaml");
let swaggerDocument: Record<string, unknown> = {};
try {
  swaggerDocument = yaml.load(fs.readFileSync(swaggerPath, "utf8")) as Record<
    string,
    unknown
  >;
} catch {
  log.warn("Could not load OpenAPI spec from swagger/openapi.yaml");
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
    workflowVersion: config.workflowVersion,
    chaosEnabled: config.chaosEnabled,
    timestamp: new Date().toISOString(),
  });
});

/** Submit an expense claim. */
app.post("/expense", async (req, res) => {
  try {
    let body = req.body as Partial<ExpenseClaimRequest>;

    // Sanitize inputs at the API boundary.
    body = sanitizeExpenseInput(
      body as Record<string, unknown>,
    ) as unknown as Partial<ExpenseClaimRequest>;

    const required: (keyof ExpenseClaimRequest)[] = [
      "employeeId", "amount", "category", "description", "receiptProvided",
    ];
    const missing = required.filter((f) => !(f in body));
    if (missing.length > 0) {
      res.status(400).json({
        error: `Missing required fields: ${missing.join(", ")}`,
      });
      return;
    }

    // Deterministic ID for idempotency.
    const expenseId = generateExpenseId(
      body.employeeId!,
      Number(body.amount),
      body.category!,
      body.description!,
    );

    // Check for duplicate submission.
    const existing = await getExpense(expenseId);
    if (existing) {
      log.info("Duplicate submission detected", { expenseId });
      res.status(409).json({
        message: "Expense already submitted",
        expenseId,
        correlationId: existing.correlationId ?? "unknown",
        status: existing.status ?? "UNKNOWN",
      });
      return;
    }

    const correlationId = uuidv4();
    const submittedAt = new Date().toISOString();

    const workflowInput: ExpenseEvent = {
      expenseId,
      employeeId: body.employeeId!,
      amount: Number(body.amount),
      category: body.category!,
      description: body.description!,
      receiptProvided: Boolean(body.receiptProvided),
      submittedAt,
      correlationId,
      workflowVersion: config.workflowVersion,
    };

    log.info("Processing expense claim", {
      expenseId,
      correlationId,
      employeeId: workflowInput.employeeId,
      amount: workflowInput.amount,
      workflowVersion: config.workflowVersion,
    });

    const result = await runWorkflow(workflowInput);

    res.status(202).json({
      message: "Expense claim submitted and processed successfully",
      expenseId,
      correlationId,
      submittedAt,
      status: result.status ?? "UNKNOWN",
      workflowVersion: config.workflowVersion,
    });
  } catch (err) {
    log.error("Workflow execution failed", { error: String(err) });
    res.status(500).json({ error: `Workflow execution failed: ${err}` });
  }
});

/** Get expense by ID. */
app.get("/expense/:expenseId", async (req, res) => {
  const { expenseId } = req.params;
  const record = await getExpense(expenseId);

  if (!record) {
    res.status(404).json({ error: `Expense ${expenseId} not found` });
    return;
  }

  res.json(record);
});

/** Get expenses by employee (paginated). */
app.get("/expenses/employee/:employeeId", async (req, res) => {
  const { employeeId } = req.params;
  const nextToken = req.query.nextToken as string | undefined;

  const result = await getExpensesByEmployee(employeeId, nextToken);

  res.json({
    expenses: result.expenses,
    count: result.expenses.length,
    employeeId,
    nextToken: result.nextToken,
  });
});

/** Manual decision for expenses pending review. */
app.post("/expenses/:expenseId/manual-decision", async (req, res) => {
  const { expenseId } = req.params;
  const body = req.body as ManualDecisionRequest;

  const result = await handleManualDecision(expenseId, body);

  if (!result.success) {
    res.status(result.error?.includes("not found") ? 404 : 400).json({
      error: result.error,
    });
    return;
  }

  res.json({
    message: "Manual decision applied",
    expense: result.expense,
  });
});

/** List all expenses (local only). */
app.get("/expenses", (_req, res) => {
  const store = getInMemoryStore();
  res.json({
    expenses: [...store.values()],
    count: store.size,
  });
});

/** Delete expense (local only). */
app.delete("/expense/:expenseId", async (req, res) => {
  const { expenseId } = req.params;
  const deleted = await deleteExpense(expenseId);

  if (!deleted) {
    res.status(404).json({ error: `Expense ${expenseId} not found` });
    return;
  }

  res.json({ message: `Expense ${expenseId} deleted`, expenseId });
});

// ---------------------------------------------------------------------------
// Authentication (DynamoDB Users table)
// ---------------------------------------------------------------------------

import {
  createUser,
  getUserByEmail,
  emailExists,
} from "../utils/users-dynamo";

const JWT_SECRET = process.env.JWT_SECRET || "local-dev-secret-change-in-production";

// Helper to verify JWT token
function verifyToken(token: string): { id: string; email: string; role: string } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string; role: string };
    return decoded;
  } catch {
    return null;
  }
}

// Helper middleware to authenticate requests
function authenticate(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized: Missing or invalid token" });
    return;
  }

  const token = authHeader.substring(7);
  const decoded = verifyToken(token);
  if (!decoded) {
    res.status(401).json({ error: "Unauthorized: Invalid token" });
    return;
  }

  (req as any).user = decoded;
  next();
}

// ---------------------------------------------------------------------------
// Auth endpoints
// ---------------------------------------------------------------------------

/** Register a new user. */
app.post("/auth/register", async (req, res) => {
  try {
    const { email, password, role, employeeId } = req.body;

    if (!email || !password || !role) {
      res.status(400).json({ error: "Missing required fields: email, password, role" });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters" });
      return;
    }

    if (!["EMPLOYEE", "MANAGER"].includes(role)) {
      res.status(400).json({ error: "Role must be EMPLOYEE or MANAGER" });
      return;
    }

    // Check if user already exists
    if (await emailExists(email)) {
      res.status(409).json({ error: "User with this email already exists" });
      return;
    }

    const userId = uuidv4();
    const passwordHash = await bcrypt.hash(password, 10);
    const finalEmployeeId = employeeId || `EMP-${userId.substring(0, 8).toUpperCase()}`;

    await createUser({
      userId,
      email: email.toLowerCase(),
      passwordHash,
      role,
      employeeId: finalEmployeeId,
      createdAt: new Date().toISOString(),
    });

    const token = jwt.sign(
      { id: userId, email: email.toLowerCase(), role },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({
      token,
      user: {
        id: userId,
        email: email.toLowerCase(),
        role,
        employeeId: finalEmployeeId,
      },
    });
  } catch (err: any) {
    if (err.message === "User already exists") {
      res.status(409).json({ error: "User with this email already exists" });
      return;
    }
    log.error("Registration failed", { error: String(err) });
    res.status(500).json({ error: "Registration failed" });
  }
});

/** Login user. */
app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: "Missing required fields: email, password" });
      return;
    }

    // Find user by email (DynamoDB GSI query)
    const user = await getUserByEmail(email);

    if (!user) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const token = jwt.sign(
      { id: user.userId, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: {
        id: user.userId,
        email: user.email,
        role: user.role,
        employeeId: user.employeeId,
      },
    });
  } catch (err) {
    log.error("Login failed", { error: String(err) });
    res.status(500).json({ error: "Login failed" });
  }
});

// ---------------------------------------------------------------------------
// Workflow simulation (mirrors Step Functions ASL)
// ---------------------------------------------------------------------------

/**
 * Simulate retry with exponential backoff.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number,
  label: string,
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxAttempts) {
        log.warn("Retrying after failure", {
          step: label,
          attempt,
          maxAttempts,
          error: lastError.message,
        });
      }
    }
  }
  throw lastError;
}

/**
 * Run the complete approval workflow locally.
 */
async function runWorkflow(input: ExpenseEvent): Promise<ExpenseEvent> {
  const ctx = {};

  try {
    // Step 1: Validate
    let result = await validateHandler(input, ctx);

    // Step 2: Short-circuit if invalid
    if (!result.validation?.passed) {
      result = await decisionHandler(result, ctx);
      return result;
    }

    // Step 3: Policy Check (with retry)
    result = await withRetry(
      () => policyHandler(result, ctx),
      2,
      "PolicyCheck",
    );

    // Step 4: Fraud Heuristic (with retry)
    result = await withRetry(
      () => fraudHandler(result, ctx),
      3,
      "FraudHeuristic",
    );

    // Step 5: Decision
    result = await decisionHandler(result, ctx);

    // Step 6 (V2 only): If NEEDS_MANUAL_REVIEW, pause for human review
    if (
      config.workflowVersion === "V2" &&
      result.status === "NEEDS_MANUAL_REVIEW"
    ) {
      log.info("V2 workflow: entering PENDING_REVIEW wait state", {
        expenseId: result.expenseId,
        correlationId: result.correlationId,
      });
      const { updateExpenseStatus } = await import("../utils/dynamo");
      await updateExpenseStatus(result.expenseId, {
        status: "PENDING_REVIEW",
      });
      result.status = "PENDING_REVIEW";
    }

    return result;
  } catch (err) {
    // Compensation: mirror Step Functions Catch block
    log.error("Workflow step failed -- running compensation", {
      expenseId: input.expenseId,
      correlationId: input.correlationId,
      error: String(err),
    });
    input.error = {
      Error: "WorkflowExecutionError",
      Cause: String(err),
    };
    const failedResult = await decisionHandler(input, ctx);
    return failedResult;
  }
}

// ---------------------------------------------------------------------------
// Server startup
// ---------------------------------------------------------------------------

const PORT = config.localPort;

app.listen(PORT, () => {
  const divider = "=".repeat(60);
  console.log(divider);
  console.log("  Expense Approval Workflow - Local Development Server");
  console.log(divider);
  console.log();
  console.log(`  API endpoint:        http://localhost:${PORT}/expense`);
  console.log(`  Swagger UI:          http://localhost:${PORT}/swagger`);
  console.log(`  Health check:        http://localhost:${PORT}/`);
  console.log(`  List expenses:       http://localhost:${PORT}/expenses`);
  console.log(`  By employee:         http://localhost:${PORT}/expenses/employee/{id}`);
  console.log(`  Manual decision:     http://localhost:${PORT}/expenses/{id}/manual-decision`);
  console.log();
  console.log(`  Workflow version:    ${config.workflowVersion}`);
  console.log(`  Chaos enabled:       ${config.chaosEnabled}`);
  console.log("  Storage mode:        In-memory");
  console.log("  Press Ctrl+C to stop.");
  console.log(divider);
});

export { app, runWorkflow };
