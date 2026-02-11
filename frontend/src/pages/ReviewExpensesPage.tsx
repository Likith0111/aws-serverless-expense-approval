import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { apiClient } from "../services/api";
import type { ExpenseRecord } from "../types";
import StatusBadge from "../components/StatusBadge";

export default function ReviewExpensesPage() {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [selectedExpense, setSelectedExpense] = useState<ExpenseRecord | null>(null);
  const [decision, setDecision] = useState<"APPROVED" | "REJECTED">("APPROVED");
  const [reason, setReason] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (user?.role === "MANAGER") {
      loadPendingExpenses();
    }
  }, [user]);

  const loadPendingExpenses = async () => {
    setIsLoading(true);
    setError("");

    try {
      const pending = await apiClient.getPendingReviews();
      setExpenses(pending);
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to load pending expenses");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitDecision = async () => {
    if (!selectedExpense || !reason.trim() || reason.trim().length < 3) {
      setError("Please provide a reason (at least 3 characters)");
      return;
    }

    setIsSubmitting(true);
    setError("");
    setSuccess("");

    try {
      await apiClient.submitManualDecision(selectedExpense.expenseId, {
        decision,
        reason: reason.trim(),
        reviewedBy: user?.email,
      });

      setSuccess("Decision submitted successfully");
      setSelectedExpense(null);
      setReason("");
      setTimeout(() => {
        loadPendingExpenses();
        setSuccess("");
      }, 1500);
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to submit decision");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (user?.role !== "MANAGER") {
    return (
      <div className="card">
        <div className="text-center py-8 text-red-600">
          Access denied. Manager role required.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">Review Expenses</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Pending Reviews ({expenses.length})
          </h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
              {success}
            </div>
          )}

          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Loading pending expenses...</div>
          ) : expenses.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No expenses pending review.
            </div>
          ) : (
            <div className="space-y-2">
              {expenses.map((expense) => (
                <div
                  key={expense.expenseId}
                  onClick={() => setSelectedExpense(expense)}
                  className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                    selectedExpense?.expenseId === expense.expenseId
                      ? "border-primary-500 bg-primary-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-sm text-gray-900">{expense.expenseId}</span>
                    <StatusBadge status={expense.status || "PENDING_REVIEW"} />
                  </div>
                  <div className="text-sm text-gray-600">
                    <div>${expense.amount.toFixed(2)} • {expense.category.replace("_", " ")}</div>
                    <div className="mt-1 truncate">{expense.description}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedExpense && (
          <div className="card">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Review Decision</h2>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Expense ID</label>
                <div className="font-mono text-sm text-gray-900">{selectedExpense.expenseId}</div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                <div className="text-lg font-semibold text-gray-900">
                  ${selectedExpense.amount.toFixed(2)}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <div className="text-sm text-gray-600 capitalize">
                  {selectedExpense.category.replace("_", " ")}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <div className="text-sm text-gray-600">{selectedExpense.description}</div>
              </div>

              {selectedExpense.fraudCheck && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fraud Risk
                  </label>
                  <div className="text-sm">
                    <span className="font-medium">{selectedExpense.fraudCheck.riskLevel}</span>
                    {" "}(Score: {selectedExpense.fraudCheck.riskScore})
                  </div>
                  {selectedExpense.fraudCheck.riskFlags.length > 0 && (
                    <ul className="mt-1 text-xs text-gray-600 list-disc list-inside">
                      {selectedExpense.fraudCheck.riskFlags.map((flag, i) => (
                        <li key={i}>{flag}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {selectedExpense.policyCheck && !selectedExpense.policyCheck.passed && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Policy Violations
                  </label>
                  <ul className="text-sm text-gray-600 list-disc list-inside">
                    {selectedExpense.policyCheck.violations.map((v, i) => (
                      <li key={i}>{v}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Decision</label>
                <div className="flex space-x-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="APPROVED"
                      checked={decision === "APPROVED"}
                      onChange={(e) => setDecision(e.target.value as "APPROVED")}
                      className="h-4 w-4 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Approve</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="REJECTED"
                      checked={decision === "REJECTED"}
                      onChange={(e) => setDecision(e.target.value as "REJECTED")}
                      className="h-4 w-4 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Reject</span>
                  </label>
                </div>
              </div>

              <div>
                <label htmlFor="reason" className="block text-sm font-medium text-gray-700 mb-1">
                  Reason *
                </label>
                <textarea
                  id="reason"
                  required
                  minLength={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="input"
                  rows={4}
                  placeholder="Provide a reason for your decision..."
                />
                <p className="mt-1 text-xs text-gray-500">Minimum 3 characters</p>
              </div>

              <div className="flex space-x-4">
                <button
                  onClick={handleSubmitDecision}
                  disabled={isSubmitting || !reason.trim() || reason.trim().length < 3}
                  className="btn btn-primary flex-1"
                >
                  {isSubmitting ? "Submitting..." : "Submit Decision"}
                </button>
                <button
                  onClick={() => {
                    setSelectedExpense(null);
                    setReason("");
                    setError("");
                  }}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
