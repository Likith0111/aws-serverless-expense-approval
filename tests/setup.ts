/**
 * Jest global setup -- runs before every test file.
 *
 * IMPORTANT: These must be set BEFORE any application module is imported
 * because config.ts reads process.env at import time.
 */
process.env.USE_IN_MEMORY = "true";
process.env.EXPENSES_TABLE = "ExpenseApprovals-Test";
process.env.AWS_REGION = "us-east-1";
process.env.LOG_LEVEL = "ERROR";
process.env.WORKFLOW_VERSION = "V1";
process.env.CHAOS_ENABLED = "false";
process.env.PAGE_SIZE = "5";