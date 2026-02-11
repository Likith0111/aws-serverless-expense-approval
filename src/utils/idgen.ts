/**
 * Deterministic expense ID generator.
 *
 * Why deterministic IDs instead of random UUIDs?
 *   Deterministic IDs are the foundation of the idempotency strategy.
 *   If a client submits the exact same expense twice (e.g., network retry),
 *   both requests produce the same expenseId. The conditional DynamoDB write
 *   then rejects the duplicate naturally, without requiring a separate
 *   idempotency-key header or server-side deduplication table.
 *
 * Algorithm:
 *   SHA-256( employeeId | amount | category | description | date )
 *   The date component (YYYY-MM-DD) scopes idempotency to a calendar day.
 *   This means an employee can submit the same expense on different days
 *   (e.g., recurring daily parking) and each is treated as a new claim.
 *
 * Format:
 *   EXP-{first 12 hex chars uppercase}  e.g. EXP-A1B2C3D4E5F6
 */

import { createHash } from "crypto";

export function generateExpenseId(
  employeeId: string,
  amount: number,
  category: string,
  description: string,
): string {
  const dateKey = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const raw = `${employeeId}|${amount}|${category}|${description}|${dateKey}`;
  const hash = createHash("sha256")
    .update(raw)
    .digest("hex")
    .substring(0, 12)
    .toUpperCase();

  return `EXP-${hash}`;
}
