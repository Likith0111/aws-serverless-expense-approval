/**
 * SubmitExpense Lambda Handler
 *
 * API Gateway entry point that accepts expense claims via HTTP POST
 * and initiates the Step Functions approval workflow. Also provides
 * a GET endpoint to retrieve expense decision status from DynamoDB.
 *
 * Architectural note:
 *   This is the only Lambda that interacts with API Gateway directly.
 *   It translates HTTP semantics (JSON body, path params, status codes)
 *   into the internal workflow format. All other Lambdas work with
 *   plain ExpenseEvent objects passed through Step Functions.
 */

import {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
  Context,
} from "aws-lambda";
import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";

// ---------------------------------------------------------------------------
// Lambda handler
// ---------------------------------------------------------------------------

export const handler = async (
  event: APIGatewayProxyEventV2,
  _context: Context,
): Promise<APIGatewayProxyResultV2> => {
  const method = event.requestContext?.http?.method ?? "";
  const path = event.rawPath ?? "";

  if (method === "POST" && path.includes("/expense")) {
    return submitExpense(event);
  } else if (method === "GET" && path.includes("/expense")) {
    return getExpense(event);
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

  // Light validation at the API boundary.
  const required = ["employeeId", "amount", "category", "description", "receiptProvided"];
  const missing = required.filter((f) => !(f in body));
  if (missing.length > 0) {
    return buildResponse(400, {
      error: `Missing required fields: ${missing.join(", ")}`,
    });
  }

  const expenseId = `EXP-${uuidv4().replace(/-/g, "").substring(0, 12).toUpperCase()}`;
  const submittedAt = new Date().toISOString();

  const workflowInput = {
    expenseId,
    employeeId: body.employeeId as string,
    amount: Number(body.amount),
    category: body.category as string,
    description: body.description as string,
    receiptProvided: Boolean(body.receiptProvided),
    submittedAt,
  };

  // Start Step Functions execution.
  const stateMachineArn = process.env.STATE_MACHINE_ARN ?? "";

  if (stateMachineArn) {
    try {
      const sfnClient = new SFNClient({});
      await sfnClient.send(
        new StartExecutionCommand({
          stateMachineArn,
          name: expenseId,
          input: JSON.stringify(workflowInput),
        }),
      );
      console.log(`Started workflow for expense ${expenseId}`);
    } catch (err) {
      console.error(`Failed to start workflow: ${err}`);
      return buildResponse(500, {
        error: "Failed to start expense approval workflow",
        expenseId,
      });
    }
  } else {
    console.warn("STATE_MACHINE_ARN not set -- workflow not started");
  }

  return buildResponse(202, {
    message: "Expense claim submitted successfully",
    expenseId,
    submittedAt,
    status: "PROCESSING",
  });
}

// ---------------------------------------------------------------------------
// GET /expense/{expenseId}
// ---------------------------------------------------------------------------

async function getExpense(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const expenseId = event.pathParameters?.expenseId;

  if (!expenseId) {
    return buildResponse(400, { error: "expenseId path parameter is required" });
  }

  const tableName = process.env.EXPENSES_TABLE ?? "ExpenseApprovals";

  try {
    const rawClient = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(rawClient);

    const result = await docClient.send(
      new GetCommand({ TableName: tableName, Key: { expenseId } }),
    );

    if (!result.Item) {
      return buildResponse(404, { error: `Expense ${expenseId} not found` });
    }

    return buildResponse(200, result.Item);
  } catch (err) {
    console.error(`Failed to retrieve expense ${expenseId}: ${err}`);
    return buildResponse(500, { error: "Failed to retrieve expense record" });
  }
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
