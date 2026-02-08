/**
 * Centralized configuration module.
 *
 * All runtime configuration is loaded from environment variables with
 * sensible defaults for local development. Lambda environment variables
 * are set via Terraform; locally they are set in tests/setup.ts or
 * by the local dev server.
 */

export const config = {
  /** DynamoDB table name for expense records. */
  expensesTable: process.env.EXPENSES_TABLE ?? "ExpenseApprovals",

  /** Optional DynamoDB Local endpoint (e.g. http://localhost:8000). */
  dynamoEndpoint: process.env.DYNAMODB_ENDPOINT,

  /** Step Functions state machine ARN (set by Terraform in Lambda env). */
  stateMachineArn: process.env.STATE_MACHINE_ARN ?? "",

  /** AWS region for SDK clients. */
  awsRegion: process.env.AWS_REGION ?? "us-east-1",

  /** When true, use an in-memory Map instead of DynamoDB. */
  useInMemory: (process.env.USE_IN_MEMORY ?? "false").toLowerCase() === "true",

  /** Port for the local development server. */
  localPort: parseInt(process.env.LOCAL_PORT ?? "5050", 10),

  /** Log level. */
  logLevel: process.env.LOG_LEVEL ?? "INFO",
};
