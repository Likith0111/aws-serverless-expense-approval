import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiClient } from "../services/api";
import type { ExpenseCategory } from "../types";

const CATEGORIES: ExpenseCategory[] = [
  "travel",
  "meals",
  "accommodation",
  "office_supplies",
  "software",
  "training",
  "client_entertainment",
  "transportation",
  "miscellaneous",
];

export default function NewExpensePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("meals");
  const [description, setDescription] = useState("");
  const [receiptProvided, setReceiptProvided] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess(false);

    const employeeId = user?.employeeId || user?.id;
    if (!employeeId) {
      setError("Employee ID not found. Please contact support.");
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError("Please enter a valid amount greater than zero");
      return;
    }

    setIsLoading(true);

    try {
      const result = await apiClient.submitExpense({
        employeeId,
        amount: amountNum,
        category,
        description: description.trim(),
        receiptProvided,
      });

      setSuccess(true);
      setTimeout(() => {
        navigate("/expenses/mine");
      }, 2000);
    } catch (err: any) {
      if (err.response?.status === 409) {
        setError("This expense has already been submitted (duplicate detected).");
      } else {
        setError(err.response?.data?.error || "Failed to submit expense. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Submit New Expense</h1>

      <div className="card">
        {success && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
            Expense submitted successfully! Redirecting to your expenses...
          </div>
        )}

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-1">
              Amount (USD) *
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">
                $
              </span>
              <input
                id="amount"
                type="number"
                step="0.01"
                min="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="input pl-8"
                placeholder="0.00"
              />
            </div>
          </div>

          <div>
            <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">
              Category *
            </label>
            <select
              id="category"
              required
              value={category}
              onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
              className="input"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
              Description *
            </label>
            <textarea
              id="description"
              required
              minLength={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input"
              rows={4}
              placeholder="Describe the expense (e.g., Team lunch at downtown restaurant)"
            />
            <p className="mt-1 text-xs text-gray-500">Minimum 3 characters</p>
          </div>

          <div className="flex items-center">
            <input
              id="receipt"
              type="checkbox"
              checked={receiptProvided}
              onChange={(e) => setReceiptProvided(e.target.checked)}
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
            />
            <label htmlFor="receipt" className="ml-2 block text-sm text-gray-700">
              I have a receipt for this expense
            </label>
          </div>

          <div className="flex space-x-4">
            <button
              type="submit"
              disabled={isLoading || success}
              className="btn btn-primary flex-1"
            >
              {isLoading ? "Submitting..." : "Submit Expense"}
            </button>
            <button
              type="button"
              onClick={() => navigate("/expenses/mine")}
              className="btn btn-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
