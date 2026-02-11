import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./routes/ProtectedRoute";
import ManagerRoute from "./routes/ManagerRoute";
import ErrorBoundary from "./components/ErrorBoundary";
import Sidebar from "./components/Sidebar";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import DashboardPage from "./pages/DashboardPage";
import NewExpensePage from "./pages/NewExpensePage";
import MyExpensesPage from "./pages/MyExpensesPage";
import ReviewExpensesPage from "./pages/ReviewExpensesPage";
import ExpenseDetailsPage from "./pages/ExpenseDetailsPage";
import NotFoundPage from "./pages/NotFoundPage";
import { useAuth } from "./context/AuthContext";

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />}
      />
      <Route
        path="/register"
        element={user ? <Navigate to="/dashboard" replace /> : <RegisterPage />}
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <AppLayout>
              <DashboardPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/expenses/new"
        element={
          <ProtectedRoute>
            <AppLayout>
              <NewExpensePage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/expenses/mine"
        element={
          <ProtectedRoute>
            <AppLayout>
              <MyExpensesPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/expenses/:expenseId"
        element={
          <ProtectedRoute>
            <AppLayout>
              <ExpenseDetailsPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/expenses/review"
        element={
          <ManagerRoute>
            <AppLayout>
              <ReviewExpensesPage />
            </AppLayout>
          </ManagerRoute>
        }
      />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
