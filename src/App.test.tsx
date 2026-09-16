import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "./App";

vi.mock("./lib/supabase", () => ({
  authRedirect: vi.fn(),
  isSupabaseConfigured: false,
  requireApprovedOwner: vi.fn(),
  supabase: null,
}));

describe("private frontend gate", () => {
  it("does not render study materials before Supabase is configured and authenticated", () => {
    render(<App />);
    expect(screen.getByText("Welcome back")).toBeInTheDocument();
    expect(screen.getByText(/Supabase environment variables have not been configured/i)).toBeInTheDocument();
    expect(screen.queryByText("Question library")).not.toBeInTheDocument();
  });
});
