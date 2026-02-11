import type { ExpenseStatus } from "../types";

interface StatusBadgeProps {
  status: ExpenseStatus;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const getStatusStyles = () => {
    switch (status) {
      case "APPROVED":
        return "bg-green-100 text-green-800";
      case "REJECTED":
        return "bg-red-100 text-red-800";
      case "NEEDS_MANUAL_REVIEW":
      case "PENDING_REVIEW":
        return "bg-yellow-100 text-yellow-800";
      case "PROCESSING":
        return "bg-blue-100 text-blue-800";
      case "FAILED_PROCESSING":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusLabel = () => {
    switch (status) {
      case "NEEDS_MANUAL_REVIEW":
        return "Needs Review";
      case "PENDING_REVIEW":
        return "Pending Review";
      case "FAILED_PROCESSING":
        return "Failed";
      default:
        return status;
    }
  };

  return (
    <span className={`badge ${getStatusStyles()}`}>
      {getStatusLabel()}
    </span>
  );
}
