import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

interface ManagerRouteProps {
  children: React.ReactNode;
}

export default function ManagerRoute({ children }: ManagerRouteProps) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== "MANAGER") {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
