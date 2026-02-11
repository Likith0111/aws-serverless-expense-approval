import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import NotFoundPage from "../NotFoundPage";

describe("NotFoundPage", () => {
  it("renders 404 heading", () => {
    render(
      <BrowserRouter>
        <NotFoundPage />
      </BrowserRouter>
    );
    expect(screen.getByText("404")).toBeInTheDocument();
  });

  it("shows page not found message", () => {
    render(
      <BrowserRouter>
        <NotFoundPage />
      </BrowserRouter>
    );
    expect(screen.getByText("Page Not Found")).toBeInTheDocument();
    expect(
      screen.getByText("The page you're looking for doesn't exist.")
    ).toBeInTheDocument();
  });

  it("has link to dashboard", () => {
    render(
      <BrowserRouter>
        <NotFoundPage />
      </BrowserRouter>
    );
    expect(
      screen.getByRole("link", { name: /go to dashboard/i })
    ).toHaveAttribute("href", "/dashboard");
  });
});
