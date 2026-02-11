import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Sidebar() {
  const { user, logout } = useAuth();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  const navItems = [
    { path: "/dashboard", label: "Dashboard", icon: "📊" },
    { path: "/expenses/new", label: "New Expense", icon: "➕" },
    { path: "/expenses/mine", label: "My Expenses", icon: "📋" },
  ];

  const managerItems = [
    { path: "/expenses/review", label: "Review Expenses", icon: "✅" },
  ];

  return (
    <div className="w-64 bg-white border-r border-gray-200 flex flex-col h-screen">
      <div className="p-6 border-b border-gray-200">
        <h1 className="text-xl font-bold text-gray-900">SpendGuard</h1>
        <p className="text-sm text-gray-500 mt-1">Expense Portal</p>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`flex items-center space-x-3 px-4 py-2 rounded-lg transition-colors ${
              isActive(item.path)
                ? "bg-primary-50 text-primary-700 font-medium"
                : "text-gray-700 hover:bg-gray-50"
            }`}
          >
            <span className="text-lg">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}

        {user?.role === "MANAGER" &&
          managerItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center space-x-3 px-4 py-2 rounded-lg transition-colors ${
                isActive(item.path)
                  ? "bg-primary-50 text-primary-700 font-medium"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
      </nav>

      <div className="p-4 border-t border-gray-200">
        <div className="mb-3 px-4 py-2">
          <p className="text-sm font-medium text-gray-900">{user?.email}</p>
          <p className="text-xs text-gray-500 capitalize">{user?.role?.toLowerCase()}</p>
        </div>
        <button
          onClick={logout}
          className="w-full btn btn-secondary text-sm"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
