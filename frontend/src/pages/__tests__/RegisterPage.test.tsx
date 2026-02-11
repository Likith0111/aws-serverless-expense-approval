import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";
import RegisterPage from "../RegisterPage";
import { AuthProvider } from "../../context/AuthContext";

const renderWithRouter = (component: React.ReactElement) => {
  return render(
    <BrowserRouter>
      <AuthProvider>{component}</AuthProvider>
    </BrowserRouter>
  );
};

describe("RegisterPage", () => {
  it("renders registration form", () => {
    renderWithRouter(<RegisterPage />);
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/role/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /register/i })
    ).toBeInTheDocument();
  });

  it("shows link to login page", () => {
    renderWithRouter(<RegisterPage />);
    expect(screen.getByText(/sign in here/i)).toBeInTheDocument();
  });

  it("shows SpendGuard branding", () => {
    renderWithRouter(<RegisterPage />);
    expect(screen.getByText("SpendGuard")).toBeInTheDocument();
    expect(screen.getByText("Create your account")).toBeInTheDocument();
  });

  it("has role selector with EMPLOYEE and MANAGER options", () => {
    renderWithRouter(<RegisterPage />);
    const roleSelect = screen.getByLabelText(/role/i) as HTMLSelectElement;
    expect(roleSelect).toBeInTheDocument();
    const options = Array.from(roleSelect.options).map((o) => o.value);
    expect(options).toContain("EMPLOYEE");
    expect(options).toContain("MANAGER");
  });

  it("shows password mismatch error", async () => {
    const user = userEvent.setup();
    renderWithRouter(<RegisterPage />);

    await user.type(screen.getByLabelText(/email address/i), "test@test.com");
    await user.type(screen.getByLabelText(/^password$/i), "password123");
    await user.type(screen.getByLabelText(/confirm password/i), "different");
    await user.click(screen.getByRole("button", { name: /register/i }));

    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    });
  });

  it("shows short password error", async () => {
    const user = userEvent.setup();
    renderWithRouter(<RegisterPage />);

    await user.type(screen.getByLabelText(/email address/i), "test@test.com");
    await user.type(screen.getByLabelText(/^password$/i), "abc");
    await user.type(screen.getByLabelText(/confirm password/i), "abc");
    await user.click(screen.getByRole("button", { name: /register/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/password must be at least 6 characters/i)
      ).toBeInTheDocument();
    });
  });

  it("has an optional employee ID field", () => {
    renderWithRouter(<RegisterPage />);
    const empIdField = screen.getByLabelText(/employee id/i);
    expect(empIdField).toBeInTheDocument();
    expect(empIdField).not.toBeRequired();
  });
});
