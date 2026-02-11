export type UserRole = "EMPLOYEE" | "MANAGER";

export interface User {
  id: string;
  email: string;
  role: UserRole;
  employeeId?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  role: UserRole;
  employeeId?: string;
}

export type ExpenseStatus =
  | "PROCESSING"
  | "APPROVED"
  | "REJECTED"
  | "NEEDS_MANUAL_REVIEW"
  | "PENDING_REVIEW"
  | "FAILED_PROCESSING";

export type ExpenseCategory =
  | "travel"
  | "meals"
  | "accommodation"
  | "office_supplies"
  | "software"
  | "training"
  | "client_entertainment"
  | "transportation"
  | "miscellaneous";

export interface ExpenseClaimRequest {
  employeeId: string;
  amount: number;
  category: ExpenseCategory;
  description: string;
  receiptProvided: boolean;
}

export interface ValidationResult {
  passed: boolean;
  errors: string[];
  validatedAt: string;
}

export interface PolicyCheckResult {
  passed: boolean;
  violations: string[];
  checkedAt: string;
}

export interface FraudCheckResult {
  riskScore: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  riskFlags: string[];
  analyzedAt: string;
}

export interface DecisionResult {
  outcome: ExpenseStatus;
  reasons: string[];
  decidedAt: string;
  manualOverride?: boolean;
  reviewedBy?: string;
}

export interface ExpenseRecord {
  expenseId: string;
  employeeId: string;
  amount: number;
  category: string;
  description: string;
  receiptProvided: boolean;
  submittedAt: string;
  correlationId?: string;
  workflowVersion?: string;
  validation?: ValidationResult;
  policyCheck?: PolicyCheckResult;
  fraudCheck?: FraudCheckResult;
  decision?: DecisionResult;
  status?: ExpenseStatus;
  updatedAt?: string;
}

export interface ManualDecisionRequest {
  decision: "APPROVED" | "REJECTED";
  reason: string;
  reviewedBy?: string;
}

export interface ApiError {
  error: string;
  message?: string;
}
