/**
 * Structured JSON logger for CloudWatch Logs Insights compatibility.
 *
 * Why structured logging matters:
 *   Plain console.log strings are difficult to search and aggregate in
 *   CloudWatch Logs Insights. Structured JSON enables queries like:
 *     fields @timestamp, message, expenseId
 *     | filter level = "ERROR"
 *     | sort @timestamp desc
 *
 * Design decisions:
 *   - Output is JSON on a single line (CloudWatch treats each line as one event).
 *   - Every log entry includes a timestamp, level, and lambda identifier.
 *   - Additional context fields (expenseId, employeeId, etc.) are merged in.
 *   - The logger respects LOG_LEVEL from config to suppress noisy output.
 */

import { config } from "./config";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  lambda: string;
  message: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Level ordering for filtering
// ---------------------------------------------------------------------------

const LEVEL_ORDER: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

const currentLevel = LEVEL_ORDER[config.logLevel as LogLevel] ?? LEVEL_ORDER.INFO;

// ---------------------------------------------------------------------------
// Logger factory
// ---------------------------------------------------------------------------

/**
 * Create a scoped logger for a specific Lambda or module.
 *
 * Usage:
 *   const log = createLogger("ValidateExpense");
 *   log.info("Validation passed", { expenseId: "EXP-123" });
 *
 * Output:
 *   {"timestamp":"...","level":"INFO","lambda":"ValidateExpense","message":"Validation passed","expenseId":"EXP-123"}
 */
export function createLogger(lambdaName: string) {
  function emit(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (LEVEL_ORDER[level] < currentLevel) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      lambda: lambdaName,
      message,
      ...context,
    };

    // Single-line JSON for CloudWatch Logs Insights compatibility.
    const line = JSON.stringify(entry);

    switch (level) {
      case "ERROR":
        console.error(line);
        break;
      case "WARN":
        console.warn(line);
        break;
      default:
        console.log(line);
    }
  }

  return {
    debug: (msg: string, ctx?: Record<string, unknown>) => emit("DEBUG", msg, ctx),
    info: (msg: string, ctx?: Record<string, unknown>) => emit("INFO", msg, ctx),
    warn: (msg: string, ctx?: Record<string, unknown>) => emit("WARN", msg, ctx),
    error: (msg: string, ctx?: Record<string, unknown>) => emit("ERROR", msg, ctx),
  };
}
