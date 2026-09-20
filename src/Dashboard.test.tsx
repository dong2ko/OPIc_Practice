import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dashboard } from "./App";
import { demoWorkspace } from "./data/demo";

const actions = {
  onStatus: vi.fn(async () => undefined),
  onFavorite: vi.fn(async () => undefined),
  onSaveNote: vi.fn(async () => undefined),
};

describe("Today dashboard", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows a different random question when requested", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    render(<Dashboard data={demoWorkspace} {...actions} />);

    const initialQuestion = screen.getByRole("heading", { level: 2, name: "Describe your home" });
    fireEvent.click(screen.getByRole("button", { name: "Next random question" }));

    expect(initialQuestion).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "A memorable music experience" })).toBeInTheDocument();
  });
});
