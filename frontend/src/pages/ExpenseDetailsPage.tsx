import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiClient } from "../services/api";
import type { ExpenseRecord } from "../types";
import StatusBadge from "../components/StatusBadge";

interface WorkflowStep {
  name: string;
  status: "completed" | "pending" | "failed";
  timestamp?: string;
  details?: string[];
  icon: string;
}

export default function ExpenseDetailsPage() {
  const { expenseId } = useParams<{ expenseId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [expense, setExpense] = useState<ExpenseRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (expenseId) {
      loadExpense();
    }
  }, [expenseId]);

  const loadExpense = async () => {
    if (!expenseId) return;

    setIsLoading(true);
    setError("");

    try {
      const data = await apiClient.getExpense(expenseId);
      setExpense(data);
    } catch (err: any) {
      setError(
        err.response?.data?.error || "Failed to load expense details"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const buildWorkflowTimeline = (exp: ExpenseRecord): WorkflowStep[] => {
    const steps: WorkflowStep[] = [];
    const now = new Date().toISOString();

    // Submission
    steps.push({
      name: "Expense Submitted",
      status: "completed",
      timestamp: exp.submittedAt,
      details: [
        `Employee: ${exp.employeeId}`,
        `Amount: $${exp.amount.toFixed(2)}`,
        `Category: ${exp.category.replace("_", " ")}`,
      ],
      icon: "📤",
    });

    // Validation
    if (exp.validation) {
      steps.push({
        name: "Validation",
        status: exp.validation.passed ? "completed" : "failed",
        timestamp: exp.validation.validatedAt,
        details: exp.validation.passed
          ? ["All validation checks passed"]
          : exp.validation.errors,
        icon: exp.validation.passed ? "✅" : "❌",
      });
    } else {
      steps.push({
        name: "Validation",
        status: "pending",
        icon: "⏳",
      });
    }

    // Policy Check
    if (exp.policyCheck) {
      steps.push({
        name: "Policy Check",
        status: exp.policyCheck.passed ? "completed" : "completed",
        timestamp: exp.policyCheck.checkedAt,
        details:
          exp.policyCheck.violations.length > 0
            ? exp.policyCheck.violations
            : ["No policy violations"],
        icon: exp.policyCheck.passed ? "✅" : "⚠️",
      });
    } else {
      steps.push({
        name: "Policy Check",
        status: "pending",
        icon: "⏳",
      });
    }

    // Fraud Check
    if (exp.fraudCheck) {
      steps.push({
        name: "Fraud Analysis",
        status: "completed",
        timestamp: exp.fraudCheck.analyzedAt,
        details: [
          `Risk Level: ${exp.fraudCheck.riskLevel}`,
          `Risk Score: ${exp.fraudCheck.riskScore}/100`,
          ...(exp.fraudCheck.riskFlags.length > 0
            ? [`Flags: ${exp.fraudCheck.riskFlags.length}`]
            : []),
        ],
        icon:
          exp.fraudCheck.riskLevel === "HIGH"
            ? "🔴"
            : exp.fraudCheck.riskLevel === "MEDIUM"
            ? "🟡"
            : "🟢",
      });
    } else {
      steps.push({
        name: "Fraud Analysis",
        status: "pending",
        icon: "⏳",
      });
    }

    // Decision
    if (exp.decision) {
      steps.push({
        name: "Final Decision",
        status:
          exp.decision.outcome === "FAILED_PROCESSING"
            ? "failed"
            : "completed",
        timestamp: exp.decision.decidedAt,
        details: [
          `Outcome: ${exp.decision.outcome}`,
          ...exp.decision.reasons,
          ...(exp.decision.manualOverride
            ? [`Reviewed by: ${exp.decision.reviewedBy || "Manager"}`]
            : []),
        ],
        icon:
          exp.decision.outcome === "APPROVED"
            ? "✅"
            : exp.decision.outcome === "REJECTED"
            ? "❌"
            : exp.decision.outcome === "NEEDS_MANUAL_REVIEW"
            ? "⏸️"
            : "⚠️",
      });
    } else {
      steps.push({
        name: "Final Decision",
        status: "pending",
        icon: "⏳",
      });
    }

    return steps;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading expense details...</div>
      </div>
    );
  }

  if (error || !expense) {
    return (
      <div className="card">
        <div className="text-center py-12">
          <div className="text-6xl mb-4 opacity-20">⚠️</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Expense Not Found
          </h2>
          <p className="text-gray-600 mb-6">{error || "The expense could not be found."}</p>
          <Link to="/expenses/mine" className="btn btn-primary">
            Back to My Expenses
          </Link>
        </div>
      </div>
    );
  }

  const timeline = buildWorkflowTimeline(expense);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            to="/expenses/mine"
            className="text-sm text-gray-600 hover:text-gray-900 mb-2 inline-block"
          >
            ← Back to My Expenses
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">
            Expense Details
          </h1>
          <p className="text-gray-600 mt-1 font-mono text-sm">
            {expense.expenseId}
          </p>
        </div>
        <StatusBadge status={expense.status || "PROCESSING"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Expense Information */}
        <div className="lg:col-span-1 space-y-6">
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Expense Information
            </h2>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm font-medium text-gray-500">Amount</dt>
                <dd className="text-2xl font-bold text-gray-900 mt-1">
                  ${expense.amount.toFixed(2)}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Category</dt>
                <dd className="text-sm text-gray-900 mt-1 capitalize">
                  {expense.category.replace("_", " ")}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">
                  Description
                </dt>
                <dd className="text-sm text-gray-900 mt-1">
                  {expense.description}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">
                  Receipt Provided
                </dt>
                <dd className="text-sm text-gray-900 mt-1">
                  {expense.receiptProvided ? (
                    <span className="text-green-600">✓ Yes</span>
                  ) : (
                    <span className="text-gray-400">✗ No</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">
                  Submitted
                </dt>
                <dd className="text-sm text-gray-900 mt-1">
                  {new Date(expense.submittedAt).toLocaleString()}
                </dd>
              </div>
              {expense.correlationId && (
                <div>
                  <dt className="text-sm font-medium text-gray-500">
                    Correlation ID
                  </dt>
                  <dd className="text-xs font-mono text-gray-600 mt-1">
                    {expense.correlationId}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {/* Fraud Details */}
          {expense.fraudCheck && (
            <div className="card">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Fraud Analysis
              </h2>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Risk Level</span>
                  <span
                    className={`text-sm font-semibold ${
                      expense.fraudCheck.riskLevel === "HIGH"
                        ? "text-red-600"
                        : expense.fraudCheck.riskLevel === "MEDIUM"
                        ? "text-yellow-600"
                        : "text-green-600"
                    }`}
                  >
                    {expense.fraudCheck.riskLevel}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Risk Score</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {expense.fraudCheck.riskScore}/100
                  </span>
                </div>
                {expense.fraudCheck.riskFlags.length > 0 && (
                  <div className="mt-4">
                    <div className="text-sm font-medium text-gray-700 mb-2">
                      Risk Flags:
                    </div>
                    <ul className="list-disc list-inside text-xs text-gray-600 space-y-1">
                      {expense.fraudCheck.riskFlags.map((flag, i) => (
                        <li key={i}>{flag}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Workflow Timeline */}
        <div className="lg:col-span-2">
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-6">
              Workflow Timeline
            </h2>
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200"></div>

              <div className="space-y-6">
                {timeline.map((step, index) => (
                  <div key={index} className="relative flex items-start">
                    {/* Step icon */}
                    <div
                      className={`relative z-10 flex items-center justify-center w-8 h-8 rounded-full ${
                        step.status === "completed"
                          ? "bg-green-100 text-green-600"
                          : step.status === "failed"
                          ? "bg-red-100 text-red-600"
                          : "bg-gray-100 text-gray-400"
                      }`}
                    >
                      <span className="text-lg">{step.icon}</span>
                    </div>

                    {/* Step content */}
                    <div className="ml-4 flex-1">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-gray-900">
                          {step.name}
                        </h3>
                        {step.timestamp && (
                          <span className="text-xs text-gray-500">
                            {new Date(step.timestamp).toLocaleString()}
                          </span>
                        )}
                      </div>
                      {step.details && step.details.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {step.details.map((detail, i) => (
                            <p
                              key={i}
                              className={`text-xs ${
                                step.status === "failed"
                                  ? "text-red-600"
                                  : "text-gray-600"
                              }`}
                            >
                              {detail}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
