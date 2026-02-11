import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { apiClient } from "../services/api";
import type { ExpenseRecord, ExpenseStatus } from "../types";
import StatusBadge from "../components/StatusBadge";
import { Link } from "react-router-dom";

export default function MyExpensesPage() {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [filter, setFilter] = useState<ExpenseStatus | "ALL">("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [nextToken, setNextToken] = useState<string | undefined>();
  const [error, setError] = useState("");

  useEffect(() => {
    if (user) {
      loadExpenses();
    }
  }, [user, filter]);

  const loadExpenses = async (token?: string) => {
    const employeeId = user?.employeeId || user?.id;
    if (!employeeId) return;

    setIsLoading(true);
    setError("");

    try {
      const data = await apiClient.getMyExpenses(employeeId, token);
      const allExpenses = token ? [...expenses, ...data.expenses] : data.expenses;
      setExpenses(allExpenses);
      setNextToken(data.nextToken);
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to load expenses");
    } finally {
      setIsLoading(false);
    }
  };

  const filteredExpenses =
    filter === "ALL"
      ? expenses
      : expenses.filter((e) => e.status === filter);

  const statusFilters: Array<{ value: ExpenseStatus | "ALL"; label: string }> = [
    { value: "ALL", label: "All" },
    { value: "APPROVED", label: "Approved" },
    { value: "REJECTED", label: "Rejected" },
    { value: "NEEDS_MANUAL_REVIEW", label: "Pending Review" },
    { value: "PROCESSING", label: "Processing" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">My Expenses</h1>
        <Link to="/expenses/new" className="btn btn-primary">
          + New Expense
        </Link>
      </div>

      <div className="card">
        <div className="flex items-center space-x-4 mb-6">
          <label className="text-sm font-medium text-gray-700">Filter by status:</label>
          <select
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value as ExpenseStatus | "ALL");
              setExpenses([]);
            }}
            className="input w-auto"
          >
            {statusFilters.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {isLoading && expenses.length === 0 ? (
          <div className="text-center py-8 text-gray-500">Loading expenses...</div>
        ) : filteredExpenses.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No expenses found.{" "}
            <Link to="/expenses/new" className="text-primary-600 hover:text-primary-700">
              Submit your first expense
            </Link>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      ID
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Amount
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Category
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Description
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Submitted
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredExpenses.map((expense) => (
                    <tr key={expense.expenseId} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-sm font-mono text-gray-900">
                        {expense.expenseId}
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                        ${expense.amount.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 capitalize">
                        {expense.category.replace("_", " ")}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">
                        {expense.description}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <StatusBadge status={expense.status || "PROCESSING"} />
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {new Date(expense.submittedAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <Link
                          to={`/expenses/${expense.expenseId}`}
                          className="text-primary-600 hover:text-primary-700 font-medium"
                        >
                          View →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {nextToken && (
              <div className="mt-4 text-center">
                <button
                  onClick={() => loadExpenses(nextToken)}
                  disabled={isLoading}
                  className="btn btn-secondary"
                >
                  {isLoading ? "Loading..." : "Load More"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
