/**
 * Input sanitization utilities.
 *
 * Why sanitize in a backend-only system?
 *   Even though this API does not render HTML, stored data may be consumed
 *   by downstream dashboards, admin UIs, or reporting tools. Stripping
 *   HTML and script tags at the ingestion boundary prevents stored XSS
 *   and ensures data integrity regardless of how it is displayed later.
 *
 * Design decisions:
 *   - Sanitization is applied once at the API entry point (submitExpense
 *     and the local server POST handler), not inside individual Lambda
 *     handlers. This avoids double-sanitization and keeps workflow steps
 *     focused on business logic.
 *   - We strip HTML tags and trim whitespace. We do NOT reject the request
 *     on the presence of HTML -- we silently clean it to avoid false
 *     positives from users who paste formatted text.
 */

// ---------------------------------------------------------------------------
// Tag stripping
// ---------------------------------------------------------------------------

/** Remove all HTML/XML tags and their content for dangerous elements. */
function stripHtmlTags(input: string): string {
  // First remove script/style tags AND their content entirely.
  let cleaned = input.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "");
  // Then remove any remaining HTML/XML tags (self-closing or otherwise).
  cleaned = cleaned.replace(/<[^>]*>/g, "");
  return cleaned;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Sanitize a free-text string field.
 *
 * Steps:
 *   1. Trim leading/trailing whitespace
 *   2. Strip HTML/script tags
 *   3. Collapse multiple spaces into one
 */
export function sanitizeText(input: string): string {
  return stripHtmlTags(input).replace(/\s+/g, " ").trim();
}

/**
 * Sanitize all string fields on an expense claim request body.
 * Returns a new object with sanitized values (does not mutate input).
 */
export function sanitizeExpenseInput(body: Record<string, unknown>): Record<string, unknown> {
  const cleaned = { ...body };

  if (typeof cleaned.description === "string") {
    cleaned.description = sanitizeText(cleaned.description);
  }

  if (typeof cleaned.employeeId === "string") {
    cleaned.employeeId = cleaned.employeeId.trim();
  }

  if (typeof cleaned.category === "string") {
    cleaned.category = cleaned.category.trim().toLowerCase();
  }

  return cleaned;
}
