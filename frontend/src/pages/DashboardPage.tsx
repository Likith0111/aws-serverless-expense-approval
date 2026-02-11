import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiClient } from "../services/api";
import type { ExpenseRecord } from "../types";
import StatusBadge from "../components/StatusBadge";

interface DashboardStats {
  total: number;
  approved: number;
  rejected: number;
  pending: number;
  totalAmount: number;
  approvedAmount: number;
  approvalRate: number;
}

function SkeletonLoader() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 bg-gray-200 rounded w-1/3"></div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="card">
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [recentExpenses, setRecentExpenses] = useState<ExpenseRecord[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    total: 0,
    approved: 0,
    rejected: 0,
    pending: 0,
    totalAmount: 0,
    approvedAmount: 0,
    approvalRate: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadDashboardData();
    }
  }, [user]);

  const loadDashboardData = async () => {
    const employeeId = user?.employeeId || user?.id;
    if (!employeeId) return;

    try {
      const data = await apiClient.getMyExpenses(employeeId);
      const expenses = data.expenses.slice(0, 5);
      setRecentExpenses(expenses);

      const allExpenses = data.expenses;
      const approved = allExpenses.filter((e) => e.status === "APPROVED");
      const rejected = allExpenses.filter((e) => e.status === "REJECTED");
      const pending = allExpenses.filter(
        (e) =>
          e.status === "NEEDS_MANUAL_REVIEW" ||
          e.status === "PENDING_REVIEW" ||
          e.status === "PROCESSING"
      );

      const totalAmount = allExpenses.reduce((sum, e) => sum + e.amount, 0);
      const approvedAmount = approved.reduce((sum, e) => sum + e.amount, 0);
      const approvalRate =
        allExpenses.length > 0
          ? Math.round((approved.length / allExpenses.length) * 100)
          : 0;

      setStats({
        total: allExpenses.length,
        approved: approved.length,
        rejected: rejected.length,
        pending: pending.length,
        totalAmount,
        approvedAmount,
        approvalRate,
      });
    } catch (err) {
      console.error("Failed to load dashboard data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <SkeletonLoader />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-1">
            Welcome back, <span className="font-medium">{user?.email}</span>
          </p>
        </div>
        <Link
          to="/expenses/new"
          className="btn btn-primary flex items-center space-x-2"
        >
          <span>+</span>
          <span>New Expense</span>
        </Link>
      </div>

      {/* Analytics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="card bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-blue-700 mb-1">
                Total Expenses
              </div>
              <div className="text-3xl font-bold text-blue-900">
                {stats.total}
              </div>
              <div className="text-xs text-blue-600 mt-1">
                ${stats.totalAmount.toFixed(2)} total
              </div>
            </div>
            <div className="text-4xl opacity-20">📊</div>
          </div>
        </div>

        <div className="card bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-green-700 mb-1">
                Approved
              </div>
              <div className="text-3xl font-bold text-green-900">
                {stats.approved}
              </div>
              <div className="text-xs text-green-600 mt-1">
                ${stats.approvedAmount.toFixed(2)} • {stats.approvalRate}% rate
              </div>
            </div>
            <div className="text-4xl opacity-20">✅</div>
          </div>
        </div>

        <div className="card bg-gradient-to-br from-red-50 to-red-100 border-red-200">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-red-700 mb-1">
                Rejected
              </div>
              <div className="text-3xl font-bold text-red-900">
                {stats.rejected}
              </div>
              <div className="text-xs text-red-600 mt-1">
                {stats.total > 0
                  ? Math.round((stats.rejected / stats.total) * 100)
                  : 0}
                % of total
              </div>
            </div>
            <div className="text-4xl opacity-20">❌</div>
          </div>
        </div>

        <div className="card bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-200">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-yellow-700 mb-1">
                Pending Review
              </div>
              <div className="text-3xl font-bold text-yellow-900">
                {stats.pending}
              </div>
              <div className="text-xs text-yellow-600 mt-1">
                Awaiting decision
              </div>
            </div>
            <div className="text-4xl opacity-20">⏳</div>
          </div>
        </div>
      </div>

      {/* Recent Expenses */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">
            Recent Expenses
          </h2>
          <Link
            to="/expenses/mine"
            className="text-sm text-primary-600 hover:text-primary-700 font-medium"
          >
            View all →
          </Link>
        </div>

        {recentExpenses.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-6xl mb-4 opacity-20">📝</div>
            <p className="text-gray-500 mb-2">No expenses yet</p>
            <Link
              to="/expenses/new"
              className="text-primary-600 hover:text-primary-700 font-medium inline-block"
            >
              Submit your first expense →
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ID
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Submitted
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {recentExpenses.map((expense) => (
                  <tr
                    key={expense.expenseId}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-4 py-3 text-sm font-mono text-gray-900">
                      {expense.expenseId}
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                      ${expense.amount.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 capitalize">
                      {expense.category.replace("_", " ")}
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
        )}
      </div>
    </div>
  );
}
