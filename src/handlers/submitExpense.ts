/**
 * SubmitExpense Lambda Handler
 *
 * API Gateway entry point for all expense-related HTTP operations.
 *
 * Endpoints handled:
 *   POST /expense                              Submit a new expense claim
 *   GET  /expense/{expenseId}                  Retrieve a specific expense
 *   GET  /expenses/employee/{employeeId}       List expenses (paginated, GSI)
 *
 * Idempotency strategy:
 *   The expenseId is generated deterministically from the expense content
 *   (SHA-256 of employeeId + amount + category + description + date).
 *   If a client retries the same request, the same ID is produced and
 *   the DynamoDB conditional write rejects the duplicate. The handler
 *   detects this and returns the existing record.
 *
 * Correlation ID:
 *   Each request generates a unique correlationId (UUID v4) for
 *   distributed tracing. It flows through every Step Functions state
 *   and appears in all structured log entries.
 */

import {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
  Context,
} from "aws-lambda";
import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import { v4 as uuidv4 } from "uuid";

import { config } from "../utils/config";
import { createLogger } from "../utils/logger";
import { sanitizeExpenseInput } from "../utils/sanitize";
import { generateExpenseId } from "../utils/idgen";
import { getExpense, getExpensesByEmployee } from "../utils/dynamo";

const log = createLogger("SubmitExpense");

// ---------------------------------------------------------------------------
// Lambda handler
// ---------------------------------------------------------------------------

export const handler = async (
  event: APIGatewayProxyEventV2,
  _context: Context,
): Promise<APIGatewayProxyResultV2> => {
  const method = event.requestContext?.http?.method ?? "";
  const path = event.rawPath ?? "";

  if (method === "POST" && path === "/expense") {
    return submitExpense(event);
  } else if (method === "GET" && path.startsWith("/expenses/employee/")) {
    return getExpensesByEmployeeRoute(event);
  } else if (method === "GET" && path.startsWith("/expense/")) {
    return getExpenseRoute(event);
  }

  return buildResponse(404, { error: "Not found" });
};

// ---------------------------------------------------------------------------
// POST /expense
// ---------------------------------------------------------------------------

async function submitExpense(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return buildResponse(400, { error: "Invalid JSON body" });
  }

  // Sanitize inputs at the API boundary.
  body = sanitizeExpenseInput(body);

  const required = ["employeeId", "amount", "category", "description", "receiptProvided"];
  const missing = required.filter((f) => !(f in body));
  if (missing.length > 0) {
    return buildResponse(400, {
      error: `Missing required fields: ${missing.join(", ")}`,
    });
  }

  // Deterministic ID for idempotency.
  const expenseId = generateExpenseId(
    body.employeeId as string,
    Number(body.amount),
    body.category as string,
    body.description as string,
  );

  // Check if this expense already exists (idempotent duplicate).
  const existing = await getExpense(expenseId);
  if (existing) {
    log.info("Duplicate submission detected, returning existing record", {
      expenseId,
      existingStatus: existing.status,
    });
    return buildResponse(409, {
      message: "Expense already submitted",
      expenseId,
      status: existing.status ?? "UNKNOWN",
      correlationId: existing.correlationId ?? "unknown",
    });
  }

  const correlationId = uuidv4();
  const submittedAt = new Date().toISOString();

  const workflowInput = {
    expenseId,
    employeeId: body.employeeId as string,
    amount: Number(body.amount),
    category: body.category as string,
    description: body.description as string,
    receiptProvided: Boolean(body.receiptProvided),
    submittedAt,
    correlationId,
    workflowVersion: config.workflowVersion,
  };

  log.info("Expense claim received", {
    expenseId,
    correlationId,
    employeeId: workflowInput.employeeId,
    amount: workflowInput.amount,
    category: workflowInput.category,
    workflowVersion: config.workflowVersion,
  });

  // Start Step Functions execution.
  if (config.stateMachineArn) {
    try {
      const sfnClient = new SFNClient({ region: config.awsRegion });
      await sfnClient.send(
        new StartExecutionCommand({
          stateMachineArn: config.stateMachineArn,
          name: expenseId,
          input: JSON.stringify(workflowInput),
        }),
      );
      log.info("Workflow started", { expenseId, correlationId });
    } catch (err) {
      log.error("Failed to start workflow", {
        expenseId,
        correlationId,
        error: String(err),
      });
      return buildResponse(500, {
        error: "Failed to start expense approval workflow",
        expenseId,
        correlationId,
      });
    }
  } else {
    log.warn("STATE_MACHINE_ARN not set -- workflow not started", {
      expenseId,
      correlationId,
    });
  }

  return buildResponse(202, {
    message: "Expense claim submitted successfully",
    expenseId,
    correlationId,
    submittedAt,
    status: "PROCESSING",
    workflowVersion: config.workflowVersion,
  });
}

// ---------------------------------------------------------------------------
// GET /expense/{expenseId}
// ---------------------------------------------------------------------------

async function getExpenseRoute(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const expenseId = event.pathParameters?.expenseId;
  if (!expenseId) {
    return buildResponse(400, { error: "expenseId path parameter is required" });
  }

  const record = await getExpense(expenseId);
  if (!record) {
    return buildResponse(404, { error: `Expense ${expenseId} not found` });
  }

  return buildResponse(200, record as unknown as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// GET /expenses/employee/{employeeId}
// ---------------------------------------------------------------------------

async function getExpensesByEmployeeRoute(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const employeeId = event.pathParameters?.employeeId;
  if (!employeeId) {
    return buildResponse(400, { error: "employeeId path parameter is required" });
  }

  const nextToken = event.queryStringParameters?.nextToken;
  const result = await getExpensesByEmployee(employeeId, nextToken);

  return buildResponse(200, {
    expenses: result.expenses,
    count: result.expenses.length,
    employeeId,
    nextToken: result.nextToken,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildResponse(
  statusCode: number,
  body: Record<string, unknown>,
): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(body),
  };
}
