import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import DashboardPage from "../DashboardPage";
import { AuthProvider } from "../../context/AuthContext";

// Mock the api module
vi.mock("../../services/api", () => ({
  apiClient: {
    getMyExpenses: vi.fn().mockResolvedValue({
      expenses: [
        {
          expenseId: "EXP-001",
          employeeId: "EMP-001",
          amount: 45.0,
          category: "meals",
          description: "Team lunch",
          receiptProvided: true,
          submittedAt: "2026-02-08T10:00:00Z",
          status: "APPROVED",
        },
        {
          expenseId: "EXP-002",
          employeeId: "EMP-001",
          amount: 150.0,
          category: "travel",
          description: "Airport transfer",
          receiptProvided: true,
          submittedAt: "2026-02-07T10:00:00Z",
          status: "REJECTED",
        },
        {
          expenseId: "EXP-003",
          employeeId: "EMP-001",
          amount: 99.0,
          category: "software",
          description: "License renewal",
          receiptProvided: false,
          submittedAt: "2026-02-06T10:00:00Z",
          status: "NEEDS_MANUAL_REVIEW",
        },
      ],
      count: 3,
      employeeId: "EMP-001",
    }),
    setToken: vi.fn(),
    clearToken: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
  },
}));

// Mock useAuth to provide a user
vi.mock("../../context/AuthContext", async () => {
  const actual = await vi.importActual("../../context/AuthContext");
  return {
    ...actual,
    useAuth: () => ({
      user: {
        id: "user-001",
        email: "test@example.com",
        role: "EMPLOYEE",
        employeeId: "EMP-001",
      },
      token: "mock-token",
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      isLoading: false,
    }),
  };
});

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders dashboard heading", async () => {
    render(
      <BrowserRouter>
        <DashboardPage />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Dashboard")).toBeInTheDocument();
    });
  });

  it("displays welcome message with user email", async () => {
    render(
      <BrowserRouter>
        <DashboardPage />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/welcome back/i)).toBeInTheDocument();
      expect(screen.getByText("test@example.com")).toBeInTheDocument();
    });
  });

  it("renders stat cards", async () => {
    render(
      <BrowserRouter>
        <DashboardPage />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Total Expenses")).toBeInTheDocument();
      expect(screen.getByText("Approved")).toBeInTheDocument();
      expect(screen.getByText("Rejected")).toBeInTheDocument();
      expect(screen.getByText("Pending Review")).toBeInTheDocument();
    });
  });

  it("shows recent expenses table", async () => {
    render(
      <BrowserRouter>
        <DashboardPage />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Recent Expenses")).toBeInTheDocument();
      expect(screen.getByText("EXP-001")).toBeInTheDocument();
    });
  });
});
