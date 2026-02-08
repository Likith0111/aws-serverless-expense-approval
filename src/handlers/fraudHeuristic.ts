/**
 * FraudHeuristic Lambda Handler
 *
 * Applies deterministic, rule-based heuristics to detect potentially
 * fraudulent or anomalous expense claims. This is explicitly NOT
 * machine learning -- it uses rules derived from common corporate
 * fraud patterns.
 *
 * Heuristic rules and point values:
 *   - Suspiciously round amounts ($500.00 exactly)        +15 pts
 *   - Threshold gaming (just below policy limits)         +25 pts
 *   - Suspicious keywords in description                  +20 pts
 *   - Very short or generic descriptions                  +15 pts
 *   - High amount without receipt                         +20 pts
 *   - Category-amount mismatch (far above typical spend)  +10 pts
 *
 * Risk levels:
 *    0-29  LOW     -- No concerns
 *   30-59  MEDIUM  -- Warrants a second look
 *   60-100 HIGH    -- Strong anomaly signal
 */

import { ExpenseEvent } from "../models/expense";

// ---------------------------------------------------------------------------
// Scoring thresholds
// ---------------------------------------------------------------------------

const RISK_THRESHOLD_LOW = 30;
const RISK_THRESHOLD_MEDIUM = 60; // >= 60 is HIGH

// ---------------------------------------------------------------------------
// Heuristic parameters
// ---------------------------------------------------------------------------

/** Dollar amounts that are "too perfect". */
const ROUND_AMOUNTS = [50, 100, 200, 250, 500, 750, 1000, 1500, 2000, 5000];
const ROUND_AMOUNT_TOLERANCE = 0.001;

/**
 * Amounts suspiciously close to known policy limits.
 * Key = target amount, Value = explanation.
 */
const THRESHOLD_AMOUNTS: Record<number, string> = {
  24.99: "Just below receipt threshold ($25)",
  74.99: "Just below meals limit ($75)",
  99.99: "Just below miscellaneous limit ($100)",
  149.99: "Just below transportation limit ($150)",
  499.99: "Just below software/accommodation limit ($500)",
};
const THRESHOLD_TOLERANCE = 1.0;

/** Keywords suggesting test data or low-effort descriptions. */
const SUSPICIOUS_KEYWORDS = [
  "test", "asdf", "xxx", "fake", "dummy", "n/a", "none", "misc",
];

/** Single-word generic descriptions that warrant scrutiny. */
const GENERIC_PATTERNS = [
  /^expense$/i,
  /^claim$/i,
  /^reimbursement$/i,
  /^business$/i,
  /^work$/i,
];

/** Typical spend by category -- amounts far above these are unusual. */
const CATEGORY_NORMS: Record<string, number> = {
  meals: 50,
  transportation: 75,
  office_supplies: 100,
};

// ---------------------------------------------------------------------------
// Lambda handler
// ---------------------------------------------------------------------------

export const handler = async (
  event: ExpenseEvent,
  _context: unknown,
): Promise<ExpenseEvent> => {
  console.log(
    `Running fraud heuristics for expense: ${event.expenseId ?? "unknown"}`,
  );

  const { riskScore, riskFlags } = analyzeFraudRisk(event);

  let riskLevel: "LOW" | "MEDIUM" | "HIGH";
  if (riskScore >= RISK_THRESHOLD_MEDIUM) {
    riskLevel = "HIGH";
  } else if (riskScore >= RISK_THRESHOLD_LOW) {
    riskLevel = "MEDIUM";
  } else {
    riskLevel = "LOW";
  }

  event.fraudCheck = {
    riskScore,
    riskLevel,
    riskFlags,
    analyzedAt: new Date().toISOString(),
  };

  console.log(
    `Fraud analysis for ${event.expenseId}: score=${riskScore}, level=${riskLevel}, flags=${riskFlags.length}`,
  );

  return event;
};

// ---------------------------------------------------------------------------
// Core heuristic logic
// ---------------------------------------------------------------------------

export function analyzeFraudRisk(
  expense: Pick<ExpenseEvent, "amount" | "description" | "category" | "receiptProvided">,
): { riskScore: number; riskFlags: string[] } {
  let riskScore = 0;
  const riskFlags: string[] = [];

  const { amount, category, receiptProvided } = expense;
  const description = (expense.description ?? "").toLowerCase().trim();

  // --- Rule 1: Suspiciously round amounts (+15) ----------------------------
  for (const round of ROUND_AMOUNTS) {
    if (Math.abs(amount - round) < ROUND_AMOUNT_TOLERANCE) {
      riskScore += 15;
      riskFlags.push(`Suspiciously round amount: $${amount.toFixed(2)}`);
      break;
    }
  }

  // --- Rule 2: Threshold gaming (+25) --------------------------------------
  for (const [thresholdStr, reason] of Object.entries(THRESHOLD_AMOUNTS)) {
    const threshold = parseFloat(thresholdStr);
    if (Math.abs(amount - threshold) < THRESHOLD_TOLERANCE && amount <= threshold) {
      riskScore += 25;
      riskFlags.push(`Threshold gaming detected: ${reason}`);
      break;
    }
  }

  // --- Rule 3: Suspicious keywords (+20) -----------------------------------
  for (const keyword of SUSPICIOUS_KEYWORDS) {
    if (description.includes(keyword)) {
      riskScore += 20;
      riskFlags.push(`Suspicious keyword in description: '${keyword}'`);
      break; // Only flag once
    }
  }

  // --- Rule 4: Generic or very short descriptions (+15) --------------------
  if (description.length < 10) {
    riskScore += 15;
    riskFlags.push("Description is suspiciously short");
  } else {
    for (const pattern of GENERIC_PATTERNS) {
      if (pattern.test(description)) {
        riskScore += 15;
        riskFlags.push("Description appears generic");
        break;
      }
    }
  }

  // --- Rule 5: High amount without receipt (+20) ---------------------------
  if (amount > 100 && !receiptProvided) {
    riskScore += 20;
    riskFlags.push("High amount submitted without receipt");
  }

  // --- Rule 6: Category-amount mismatch (+10) ------------------------------
  const norm = CATEGORY_NORMS[category];
  if (norm !== undefined && amount > norm * 2) {
    riskScore += 10;
    riskFlags.push(
      `Amount is significantly above typical ${category} expense (norm ~$${norm.toFixed(2)})`,
    );
  }

  // Cap at 100 to avoid misleading scores from edge-case stacking.
  riskScore = Math.min(riskScore, 100);

  return { riskScore, riskFlags };
}
