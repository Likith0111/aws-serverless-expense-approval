/**
 * Centralized configuration module -- the SINGLE source of truth for all
 * runtime settings across Lambda handlers, the local dev server, and tests.
 *
 * Design decisions:
 *   - All process.env access is isolated here. No other file should read
 *     process.env directly. This ensures configuration changes are auditable
 *     and testable from a single location.
 *   - Defaults are tuned for local development so the app runs with zero
 *     environment setup out of the box.
 *   - In production, Lambda environment variables are injected via Terraform
 *     (see terraform/lambda.tf).
 */

export const config = {
  // ---------------------------------------------------------------------------
  // AWS
  // ---------------------------------------------------------------------------

  /** AWS region for SDK clients. */
  awsRegion: process.env.AWS_REGION ?? "us-east-1",

  // ---------------------------------------------------------------------------
  // DynamoDB
  // ---------------------------------------------------------------------------

  /** DynamoDB table name for expense records. */
  expensesTable: process.env.EXPENSES_TABLE ?? "ExpenseApprovals",

  /** DynamoDB table name for user records. */
  usersTable: process.env.USERS_TABLE ?? "UsersTable",

  /** Optional DynamoDB Local endpoint (e.g. http://localhost:8000). */
  dynamoEndpoint: process.env.DYNAMODB_ENDPOINT,

  /** GSI name for querying expenses by employee. */
  employeeIndexName: process.env.EMPLOYEE_INDEX_NAME ?? "EmployeeIndex",

  /** GSI name for querying users by email. */
  emailIndexName: process.env.EMAIL_INDEX_NAME ?? "EmailIndex",

  /** Maximum items per page for paginated queries. */
  pageSize: parseInt(process.env.PAGE_SIZE ?? "20", 10),

  // ---------------------------------------------------------------------------
  // Step Functions
  // ---------------------------------------------------------------------------

  /** Step Functions state machine ARN (set by Terraform in Lambda env). */
  stateMachineArn: process.env.STATE_MACHINE_ARN ?? "",

  /**
   * Workflow version to use: "V1" or "V2".
   *   V1: Standard flow (Validate -> Parallel -> Decision -> End)
   *   V2: Adds manual approval wait state for NEEDS_MANUAL_REVIEW
   */
  workflowVersion: process.env.WORKFLOW_VERSION ?? "V1",

  // ---------------------------------------------------------------------------
  // Storage mode
  // ---------------------------------------------------------------------------

  /**
   * Storage mode: "local" (in-memory), "dynamodb-local" (Docker), or "aws" (real AWS DynamoDB).
   * When "local", bypasses DynamoDB entirely and uses an in-memory Map.
   * Defaults to "local" for zero-config local development.
   */
  storageMode: (process.env.STORAGE_MODE ?? "local").toLowerCase(),

  /**
   * @deprecated Use storageMode instead. Kept for backward compatibility.
   * When true, bypass DynamoDB entirely and use an in-memory Map.
   */
  useInMemory: (() => {
    const storageMode = (process.env.STORAGE_MODE ?? "local").toLowerCase();
    const useInMemoryEnv = process.env.USE_IN_MEMORY?.toLowerCase();
    return storageMode === "local" || useInMemoryEnv === "true";
  })(),

  // ---------------------------------------------------------------------------
  // Local development
  // ---------------------------------------------------------------------------

  /** Port for the local development server. */
  localPort: parseInt(process.env.LOCAL_PORT ?? "5050", 10),

  // ---------------------------------------------------------------------------
  // Logging
  // ---------------------------------------------------------------------------

  /** Log level: DEBUG, INFO, WARN, ERROR. */
  logLevel: (process.env.LOG_LEVEL ?? "INFO").toUpperCase(),

  // ---------------------------------------------------------------------------
  // Chaos engineering
  // ---------------------------------------------------------------------------

  /**
   * When true, enables deterministic failure injection in FraudHeuristic.
   * Expenses with amounts ending in .13 will trigger a simulated failure.
   * Used for testing retry and compensation logic.
   */
  chaosEnabled: (process.env.CHAOS_ENABLED ?? "false").toLowerCase() === "true",
};
