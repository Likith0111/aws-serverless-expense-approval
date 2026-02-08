/**
 * Jest global setup -- runs before every test file.
 *
 * Configures environment variables for in-memory mode so that
 * no AWS credentials or external services are required.
 */
process.env.USE_IN_MEMORY = "true";
process.env.EXPENSES_TABLE = "ExpenseApprovals-Test";
process.env.AWS_REGION = "us-east-1";
