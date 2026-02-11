import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Sidebar from "../Sidebar";

// Helper to mock auth context
const mockAuthContext = (role: "EMPLOYEE" | "MANAGER") => {
  vi.doMock("../../context/AuthContext", () => ({
    useAuth: () => ({
      user: {
        id: "user-001",
        email: "test@example.com",
        role,
        employeeId: "EMP-001",
      },
      token: "mock-token",
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      isLoading: false,
    }),
  }));
};

vi.mock("../../context/AuthContext", () => ({
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
}));

describe("Sidebar", () => {
  it("renders SpendGuard branding", () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );
    expect(screen.getByText("SpendGuard")).toBeInTheDocument();
    expect(screen.getByText("Expense Portal")).toBeInTheDocument();
  });

  it("renders main navigation items", () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("New Expense")).toBeInTheDocument();
    expect(screen.getByText("My Expenses")).toBeInTheDocument();
  });

  it("renders user email and role", () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );
    expect(screen.getByText("test@example.com")).toBeInTheDocument();
    expect(screen.getByText("employee")).toBeInTheDocument();
  });

  it("renders sign out button", () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );
    expect(
      screen.getByRole("button", { name: /sign out/i })
    ).toBeInTheDocument();
  });
});
