import { sanitizeText, sanitizeExpenseInput } from "../../src/utils/sanitize";

describe("sanitizeText()", () => {
  it("trims whitespace", () => { expect(sanitizeText("  hello  ")).toBe("hello"); });
  it("strips HTML tags", () => { expect(sanitizeText('<script>alert("xss")</script>Team lunch')).toBe("Team lunch"); });
  it("strips nested HTML", () => { expect(sanitizeText("<div><b>bold</b></div>")).toBe("bold"); });
  it("collapses spaces", () => { expect(sanitizeText("a   b   c")).toBe("a b c"); });
  it("handles empty string", () => { expect(sanitizeText("")).toBe(""); });
  it("preserves normal text", () => { expect(sanitizeText("Team lunch at restaurant")).toBe("Team lunch at restaurant"); });
  it("strips style tags with content", () => { expect(sanitizeText("<style>body{}</style>Text")).toBe("Text"); });
});

describe("sanitizeExpenseInput()", () => {
  it("sanitizes description", () => {
    const r = sanitizeExpenseInput({ description: "  <b>Test</b>  " });
    expect(r.description).toBe("Test");
  });
  it("trims employeeId", () => { expect(sanitizeExpenseInput({ employeeId: "  EMP-001  " }).employeeId).toBe("EMP-001"); });
  it("normalizes category", () => { expect(sanitizeExpenseInput({ category: "  Meals  " }).category).toBe("meals"); });
  it("does not mutate input", () => {
    const orig = { description: "<b>Hi</b>", employeeId: "EMP-1", category: "Meals" };
    const copy = { ...orig };
    sanitizeExpenseInput(orig);
    expect(orig.description).toBe(copy.description);
  });
  it("handles non-string fields", () => {
    const r = sanitizeExpenseInput({ amount: 42, receiptProvided: true });
    expect(r.amount).toBe(42);
    expect(r.receiptProvided).toBe(true);
  });
});
